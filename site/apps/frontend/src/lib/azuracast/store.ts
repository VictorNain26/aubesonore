import { create } from 'zustand';
import { safeParse } from 'valibot';
import { STATIC_NOWPLAYING_URL } from '../config';
import { NowPlayingSchema, type NowPlaying } from './validators';

// ─────────────────────────────────────────────
// Now-playing store (Zustand). Polling lifecycle lives outside the store
// in `startNowPlayingPolling`, which is started once by the
// <NowPlayingPoller /> mounted at the app root. Consumers read slices via
// granular selectors so a poll only re-renders components whose actual
// slice changed.
// ─────────────────────────────────────────────
// Why polling instead of SSE/WebSocket:
// AzuraCast writes a static JSON file every ~10s with `Cache-Control: max-age=10`.
// Polling that file via fetch is dramatically cheaper than holding a Centrifugo
// SSE connection per listener, fully cacheable by a CDN (Cloudflare etc.), and
// keeps the client free of any reconnect / heartbeat / stale-watchdog complexity.
// For a music station (3-5 min tracks, no live DJ) a 5s avg latency on track
// changes is imperceptible. See the AzuraCast docs §"Static Now Playing JSON".

interface NowPlayingState {
  data: NowPlaying | null;
  isConnected: boolean;
  error: string | null;
}

export const useNowPlayingStore = create<NowPlayingState>(() => ({
  data: null,
  isConnected: false,
  error: null,
}));

// Adaptive polling cadence:
// - DEFAULT_POLL_MS  : when we have no NowPlaying data yet (cold start)
// - MID_TRACK_POLL_MS: well inside the current track; we have time before the next change
// - NEAR_END_POLL_MS : the track is about to flip — poll fast so UI updates feel instant
// JITTER_RATIO ±20% desynchronises clients to avoid thundering-herd at T=0s/10s/20s.
const DEFAULT_POLL_MS = 10_000;
const MID_TRACK_POLL_MS = 15_000;
const NEAR_END_POLL_MS = 5_000;
const NEAR_END_THRESHOLD_SEC = 20;
const JITTER_RATIO = 0.2;
const BACKOFF_MS = [1_000, 2_000, 4_000, 8_000, 16_000] as const;

let pollTimer: ReturnType<typeof setTimeout> | null = null;
let inflight: AbortController | null = null;
let consecutiveErrors = 0;
let visibilityListenerAttached = false;
let isStarted = false;

function clearTimer(): void {
  if (pollTimer !== null) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
}

function cancelInflight(): void {
  if (inflight !== null) {
    inflight.abort();
    inflight = null;
  }
}

// Pure: pick the next baseline interval from the current NowPlaying state.
// The static file freezes `elapsed`/`remaining`, so derive remaining live from
// `played_at` per the AzuraCast docs.
function baseInterval(): number {
  const np = useNowPlayingStore.getState().data?.now_playing;
  if (!np) return DEFAULT_POLL_MS;
  const nowSec = Math.floor(Date.now() / 1000);
  const remaining = np.duration - (nowSec - np.played_at);
  if (remaining < NEAR_END_THRESHOLD_SEC) return NEAR_END_POLL_MS;
  return MID_TRACK_POLL_MS;
}

function nextDelay(): number {
  if (consecutiveErrors > 0) {
    const idx = Math.min(consecutiveErrors - 1, BACKOFF_MS.length - 1);
    return BACKOFF_MS[idx] ?? 16_000;
  }
  const base = baseInterval();
  const jitter = (Math.random() * 2 - 1) * base * JITTER_RATIO;
  return Math.max(1_000, Math.round(base + jitter));
}

async function pollOnce(): Promise<void> {
  cancelInflight();
  const controller = new AbortController();
  inflight = controller;

  try {
    const response = await fetch(STATIC_NOWPLAYING_URL, {
      signal: controller.signal,
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });

    // 304 may still come from an intermediate cache validating via ETag.
    // Keep current data and confirm the connection is healthy.
    if (response.status === 304) {
      consecutiveErrors = 0;
      useNowPlayingStore.setState({ isConnected: true, error: null });
      return;
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const json: unknown = await response.json();
    const parsed = safeParse(NowPlayingSchema, json);
    if (!parsed.success) {
      console.error('[AzuraCast] invalid NowPlaying shape:', parsed.issues);
      throw new Error('invalid payload');
    }

    consecutiveErrors = 0;
    useNowPlayingStore.setState({
      data: parsed.output,
      isConnected: true,
      error: null,
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') return;
    consecutiveErrors++;
    const message = err instanceof Error ? err.message : 'fetch failed';
    console.warn('[AzuraCast] poll failed:', message);
    useNowPlayingStore.setState({ isConnected: false, error: message });
  } finally {
    if (inflight === controller) inflight = null;
  }
}

function scheduleNext(): void {
  clearTimer();
  if (!isStarted) return;
  pollTimer = setTimeout(() => {
    void runPoll();
  }, nextDelay());
}

async function runPoll(): Promise<void> {
  if (!isStarted) return;
  if (typeof document !== 'undefined' && document.hidden) return;
  await pollOnce();
  scheduleNext();
}

function handleVisibility(): void {
  if (!isStarted) return;
  if (document.hidden) {
    // Pause: cancel any in-flight fetch + timer, keep store data intact.
    clearTimer();
    cancelInflight();
    useNowPlayingStore.setState({ isConnected: false });
  } else {
    // Resume immediately on focus return.
    consecutiveErrors = 0;
    void runPoll();
  }
}

function attachVisibilityListener(): void {
  if (visibilityListenerAttached) return;
  if (typeof document === 'undefined') return;
  document.addEventListener('visibilitychange', handleVisibility);
  visibilityListenerAttached = true;
}

function detachVisibilityListener(): void {
  if (!visibilityListenerAttached) return;
  if (typeof document === 'undefined') return;
  document.removeEventListener('visibilitychange', handleVisibility);
  visibilityListenerAttached = false;
}

/**
 * Start the polling loop. Returns a cleanup function that stops the loop
 * and detaches listeners. Idempotent: calling twice with no stop between
 * is a no-op and returns a no-op cleanup.
 */
export function startNowPlayingPolling(): () => void {
  if (isStarted) return () => {};
  isStarted = true;
  attachVisibilityListener();
  if (!(typeof document !== 'undefined' && document.hidden)) {
    void runPoll();
  }
  return () => {
    if (!isStarted) return;
    isStarted = false;
    detachVisibilityListener();
    clearTimer();
    cancelInflight();
    consecutiveErrors = 0;
    // Keep state.data so remounted consumers see the last value immediately.
    useNowPlayingStore.setState({ isConnected: false });
  };
}

// ─────────────────────────────────────────────
// Test-only helpers
// ─────────────────────────────────────────────

/**
 * @internal Reset module state. Exported for unit tests only — calling this
 * from app code will tear down the polling loop for everyone.
 */
export function __resetNowPlayingStore(): void {
  isStarted = false;
  detachVisibilityListener();
  clearTimer();
  cancelInflight();
  consecutiveErrors = 0;
  useNowPlayingStore.setState({ data: null, isConnected: false, error: null });
}
