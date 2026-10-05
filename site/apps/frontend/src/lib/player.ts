import { create } from 'zustand';
import { STREAM_URL } from '../utils/config';

const STORAGE_KEY = 'aubesonore_volume';

// Auto-recovery tuning. Live MP3 streams routinely "stall" or "end" on
// Liquidsoap track changes / brief network blips; the native <audio>
// element does not reconnect on its own, so we do it for it.
const STALL_RECOVERY_MS = 1_500; // wait this long before declaring a stall fatal
const RECONNECT_BACKOFF_MS = [500, 1000, 2000, 4000, 8000]; // capped at last value

export interface PlayError {
  code: 'aborted' | 'network' | 'unknown';
  message: string;
}

interface PlayerState {
  isPlaying: boolean;
  /** Between the click on Écouter and the first sound (stream buffering). */
  isConnecting: boolean;
  volume: number;
  isMuted: boolean;
  playError: PlayError | null;
}

interface PlayerActions {
  play: () => Promise<void>;
  stop: () => void;
  /** The one play button: starts, or stops (also while still connecting). */
  toggle: () => void;
  setVolume: (value: number) => void;
  toggleMute: () => void;
  clearPlayError: () => void;
  /** Read the saved volume once mounted (the pre-rendered page starts at 1). */
  restoreVolume: () => void;
}

type PlayerStore = PlayerState & PlayerActions;

// The stream plays through a bare native <audio> element on iOS only, where
// createMediaElementSource() would make the AudioContext the audio's sole
// output path — and iOS suspends that context a few seconds after the screen
// locks, silencing background playback (WebKit bug #231105). Everywhere else
// the stream is routed through Web Audio so the antenna waveform can read
// real frequency data; on iOS it falls back to its procedural motion.
// Lock-screen controls come from Media Session either way.
function canAnalyze(): boolean {
  const isIOS =
    /iP(hone|ad|od)/.test(navigator.userAgent) ||
    (navigator.userAgent.includes('Mac') && navigator.maxTouchPoints > 1);
  return !isIOS && typeof AudioContext !== 'undefined';
}

// Created on first use, never at import: the page is pre-rendered at build
// time, where there is no window, no Audio and no localStorage.
let audioElement: HTMLAudioElement | null = null;

export function getAudioElement(): HTMLAudioElement {
  if (!audioElement) {
    audioElement = new Audio();
    audioElement.preload = 'none';
    audioElement.crossOrigin = 'anonymous';
    audioElement.setAttribute('x-webkit-airplay', 'allow');
    audioElement.setAttribute('airplay', 'allow');
    audioElement.volume = getStoredVolume();
    attachResilience(audioElement);
  }
  return audioElement;
}

let audioContext: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let sourceNode: MediaElementAudioSourceNode | null = null;
// Fades the sound in on play and out on stop, as SoundCloud does, apart from the listener's
// volume (audio.volume). Before the analyser, so the horizon line calms down with the sound.
// None on iOS: the stream stays off Web Audio there (above), a gain on a media element has no
// effect there anyway (WebKit #151589) and the page cannot set the volume (Apple's Safari
// audio guide, iOS-Specific Considerations): the sound cuts.
let fader: GainNode | null = null;
let stopTimer: ReturnType<typeof setTimeout> | null = null;
const FADE_IN_S = 0.6;
const FADE_OUT_S = 0.4;
// Tracks if a stop() is in progress so the resulting audio error event
// is not surfaced as a playError to the user.
let isStopping = false;
// True between user-initiated play() and stop(). Used to decide whether
// audio-level disconnects should auto-recover.
let wantsPlayback = false;
let stallTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempts = 0;

const getStoredVolume = (): number => {
  try {
    const stored = parseFloat(localStorage.getItem(STORAGE_KEY) ?? '');
    // A 0 saved before silence stopped being kept would start every visit muted.
    return stored > 0 && stored <= 1 ? stored : 1;
  } catch {
    return 1;
  }
};

const initAudioContext = (audio: HTMLAudioElement) => {
  if ((audioContext && sourceNode) || !canAnalyze()) return;
  audioContext = new AudioContext();
  analyser = audioContext.createAnalyser();
  analyser.fftSize = 512;
  analyser.smoothingTimeConstant = 0.8;
  fader = audioContext.createGain();
  sourceNode = audioContext.createMediaElementSource(audio);
  sourceNode.connect(fader);
  fader.connect(analyser);
  analyser.connect(audioContext.destination);
};

/**
 * Ramps the fader from where it is to `value` in `seconds`. A ramp starts at the previous
 * scheduled event, hence the value set now; cancelAndHoldAtTime would do both, but Firefox lacks it.
 */
function fadeTo(value: number, seconds: number): void {
  if (!fader || !audioContext) return;
  const now = audioContext.currentTime;
  fader.gain.cancelScheduledValues(now);
  fader.gain.setValueAtTime(fader.gain.value, now);
  fader.gain.linearRampToValueAtTime(value, now + seconds);
}

export const getAnalyser = (): AnalyserNode | null => analyser;

function classifyPlayError(err: unknown): PlayError | null {
  if (err instanceof Error && err.name === 'AbortError') {
    return null;
  }
  if (err instanceof Error) {
    const isNetwork = /network|fetch|load/i.test(err.message);
    return {
      code: isNetwork ? 'network' : 'unknown',
      message: err.message,
    };
  }
  return { code: 'unknown', message: String(err) };
}

function clearStallTimer() {
  if (stallTimer) {
    clearTimeout(stallTimer);
    stallTimer = null;
  }
}

/**
 * Re-attach the stream URL and call play() again. Live streams cannot be
 * "resumed" — the only way to recover from a stall/end/error is to start a
 * fresh request. Backoff guards against hammering the server when it's down.
 */
function reconnect(): void {
  if (!wantsPlayback) return;
  const delay =
    RECONNECT_BACKOFF_MS[Math.min(reconnectAttempts, RECONNECT_BACKOFF_MS.length - 1)] ?? 8000;
  reconnectAttempts++;
  setTimeout(() => {
    if (!wantsPlayback) return;
    console.debug('[Player] auto-reconnect attempt', reconnectAttempts);
    const audio = getAudioElement();
    audio.src = STREAM_URL;
    audio.load();
    void audio.play().catch((err: unknown) => {
      console.warn('[Player] reconnect play() rejected:', (err as Error).message);
    });
  }, delay);
}

/** A device the stream is cast to (Chromecast): while one is set, play, stop and volume go to it. */
export interface RemotePlayback {
  play: () => void;
  stop: () => void;
  setVolume: (value: number) => void;
}

let remote: RemotePlayback | null = null;

export function setRemotePlayback(next: RemotePlayback | null): void {
  remote = next;
}

let prevVolume = 0.5;
// Each play() gets a number; a stop() or a newer play() makes older attempts
// stale, so a late resolve or reject cannot overwrite the current state.
let playAttempt = 0;

export const usePlayer = create<PlayerStore>((set, get) => ({
  isPlaying: false,
  isConnecting: false,
  volume: 1,
  isMuted: false,
  playError: null,

  play: async () => {
    const attempt = ++playAttempt;
    // Cast: the device plays; its state comes back through the cast store.
    if (remote) {
      set({ playError: null, isConnecting: true });
      remote.play();
      return;
    }
    // A play during the stop's fade-out keeps the stream it was about to cut.
    if (stopTimer) {
      clearTimeout(stopTimer);
      stopTimer = null;
    }
    set({ playError: null, isConnecting: true });
    wantsPlayback = true;
    reconnectAttempts = 0;
    const audio = getAudioElement();
    try {
      initAudioContext(audio);
      if (audioContext?.state === 'suspended') {
        await audioContext.resume();
      }
      fadeTo(0, 0);
      audio.src = STREAM_URL;
      audio.load();
      await audio.play();
      if (attempt !== playAttempt) return;
      fadeTo(1, FADE_IN_S);
      set({ isPlaying: true, isConnecting: false });
    } catch (error) {
      if (attempt !== playAttempt) return;
      wantsPlayback = false;
      const playError = classifyPlayError(error);
      console.error('[Player] Playback failed:', error);
      set({ isPlaying: false, isConnecting: false, playError });
    }
  },

  stop: () => {
    playAttempt++;
    if (remote) {
      remote.stop();
      set({ isPlaying: false, isConnecting: false, playError: null });
      return;
    }
    wantsPlayback = false;
    clearStallTimer();
    reconnectAttempts = 0;
    const audio = getAudioElement();
    // The button says Écouter at once; the sound fades out, then the stream is cut.
    set({ isPlaying: false, isConnecting: false, playError: null });
    const cut = () => {
      stopTimer = null;
      isStopping = true;
      audio.pause();
      audio.src = '';
      queueMicrotask(() => {
        isStopping = false;
      });
    };
    if (fader && !audio.paused) {
      fadeTo(0, FADE_OUT_S);
      stopTimer = setTimeout(cut, FADE_OUT_S * 1000);
    } else {
      cut();
    }
  },

  toggle: () => {
    const { isPlaying, isConnecting, play, stop } = get();
    if (isPlaying || isConnecting) stop();
    else void play();
  },

  setVolume: (value: number) => {
    const clamped = Math.max(0, Math.min(1, value));
    getAudioElement().volume = clamped;
    remote?.setVolume(clamped);
    // Silence is not kept: the next visit starts at the last audible level,
    // never on a mute the listener has forgotten.
    if (clamped > 0) {
      try {
        localStorage.setItem(STORAGE_KEY, clamped.toString());
      } catch {
        // localStorage unavailable (private mode) — keep in-memory state only
      }
    }
    if (clamped > 0) prevVolume = clamped;
    set({ volume: clamped, isMuted: clamped === 0 });
  },

  toggleMute: () => {
    const { isMuted, volume, setVolume } = get();
    if (isMuted) {
      setVolume(prevVolume || 0.5);
    } else {
      prevVolume = volume;
      setVolume(0);
    }
  },

  clearPlayError: () => set({ playError: null }),

  restoreVolume: () => {
    const volume = getStoredVolume();
    if (volume > 0) prevVolume = volume;
    set({ volume, isMuted: volume === 0 });
  },
}));

// ─────────────────────────────────────────────
// Stream resilience: catch the events that briefly silence a live MP3
// (server track-change, network blip, encoder hiccup) and auto-recover.
// Without these, the user hears 1+ second of dead air with no recovery.
// ─────────────────────────────────────────────

function attachResilience(audio: HTMLAudioElement): void {
  audio.addEventListener('playing', () => {
    // Decoder is producing samples again — stream is healthy, cancel any
    // pending stall recovery and reset backoff for the next incident.
    clearStallTimer();
    reconnectAttempts = 0;
  });

  audio.addEventListener('waiting', () => {
    if (!wantsPlayback || isStopping) return;
    // The browser ran out of buffered samples but hasn't given up yet.
    // Give it a short grace period before forcing a reconnect.
    clearStallTimer();
    stallTimer = setTimeout(() => {
      console.warn('[Player] sustained waiting state, forcing reconnect');
      reconnect();
    }, STALL_RECOVERY_MS);
  });

  audio.addEventListener('stalled', () => {
    if (!wantsPlayback || isStopping) return;
    console.warn('[Player] stalled (no data received)');
    // Same grace period as waiting — they often fire together.
    if (!stallTimer) {
      stallTimer = setTimeout(() => reconnect(), STALL_RECOVERY_MS);
    }
  });

  audio.addEventListener('ended', () => {
    if (!wantsPlayback || isStopping) return;
    // A live stream should never "end". When it does, the upstream closed
    // the connection (encoder restart, Liquidsoap reload). Reconnect now.
    console.warn('[Player] stream ended unexpectedly, reconnecting');
    reconnect();
  });

  audio.addEventListener('error', () => {
    if (isStopping) return;
    console.error('[Player] Audio element error:', audio.error);
    if (wantsPlayback) reconnect();
  });
}

if (import.meta.hot) {
  import.meta.hot.accept(() => {
    // No-op: keep existing audio + source node, do not re-init
  });
}
