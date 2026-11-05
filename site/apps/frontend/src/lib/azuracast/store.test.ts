// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../../mocks/server';
import { makeNowPlaying } from '../../mocks/handlers';
import {
  useNowPlayingStore,
  startNowPlayingPolling,
  retryNowPlaying,
  __resetNowPlayingStore,
} from './store';

const URL_NP = 'https://radio.aubesonore.fr/api/nowplaying_static/aubesonore.json';

function setHidden(hidden: boolean): void {
  Object.defineProperty(document, 'hidden', { value: hidden, configurable: true });
  Object.defineProperty(document, 'visibilityState', {
    value: hidden ? 'hidden' : 'visible',
    configurable: true,
  });
}

// Each test starts polling explicitly and stops via the returned cleanup.
// Track started loops so a failure midway still tears them down.
let activeStop: (() => void) | null = null;
function start(): () => void {
  const stop = startNowPlayingPolling();
  activeStop = stop;
  return stop;
}

beforeEach(() => {
  // jsdom defaults document.hidden to true, which would block the poll loop.
  setHidden(false);
  // Pin Math.random so jitter computes to 0 — deterministic timing in tests.
  vi.spyOn(Math, 'random').mockReturnValue(0.5);
  __resetNowPlayingStore();
});

afterEach(() => {
  activeStop?.();
  activeStop = null;
  __resetNowPlayingStore();
  vi.useRealTimers();
});

// MSW payload helper that produces a `now_playing` fresh enough to land in the
// MID_TRACK band (remaining ≈ 150s ⇒ 15s baseline poll).
function freshNowPlaying() {
  const np = makeNowPlaying();
  np.now_playing.played_at = Math.floor(Date.now() / 1000) - 30;
  np.now_playing.duration = 180;
  return np;
}

// ─────────────────────────────────────────────
// Initial fetch
// ─────────────────────────────────────────────

describe('nowPlaying store — initial poll', () => {
  it('populates data on the first successful fetch', async () => {
    start();
    const { result } = renderHook(() => useNowPlayingStore((s) => s));
    await waitFor(() => expect(result.current.data?.now_playing.song.title).toBe('Test Title'));
    expect(result.current.isConnected).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it('sets error and keeps data null when the server returns 500', async () => {
    server.use(http.get(URL_NP, () => new HttpResponse(null, { status: 500 })));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    start();
    const { result } = renderHook(() => useNowPlayingStore((s) => s));
    await waitFor(() => expect(result.current.error).toBe('HTTP 500'));
    expect(result.current.data).toBeNull();
    expect(result.current.isConnected).toBe(false);
  });

  it('sets error and keeps data null on a payload of the wrong shape', async () => {
    server.use(http.get(URL_NP, () => HttpResponse.json({ broken: true })));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    start();
    const { result } = renderHook(() => useNowPlayingStore((s) => s));
    await waitFor(() => expect(result.current.error).toBe('invalid payload'));
    expect(result.current.data).toBeNull();
  });
});

// ─────────────────────────────────────────────
// Lifecycle
// ─────────────────────────────────────────────

describe('nowPlaying store — lifecycle', () => {
  it('stops polling after the cleanup returned by start() is called', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let calls = 0;
    server.use(
      http.get(URL_NP, () => {
        calls++;
        return HttpResponse.json(makeNowPlaying());
      })
    );
    const stop = start();
    activeStop = null;
    await vi.waitFor(() => expect(calls).toBe(1));
    stop();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(calls).toBe(1);
  });

  it('a second start runs no second loop, and its cleanup leaves the first one running', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let calls = 0;
    server.use(
      http.get(URL_NP, () => {
        calls++;
        return HttpResponse.json(freshNowPlaying());
      })
    );
    start();
    const second = startNowPlayingPolling();
    await vi.waitFor(() => expect(calls).toBe(1));
    second();

    // One loop at the mid-track cadence (15 s): one more poll in 16 s, not none, not two.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(16_000);
    });
    expect(calls).toBe(2);
  });
});

// ─────────────────────────────────────────────
// Polling cadence
// ─────────────────────────────────────────────

describe('nowPlaying store — cadence', () => {
  // Math.random 0.5 is no jitter, 0 is -20 %, 1 is +20 %. The next poll comes inside the window.
  it.each([
    ['mid-track (15 s) while plenty of the track remains', 30, 0.5, 14_000, 16_000],
    ['near-end (5 s) once less than 20 s remain', 170, 0.5, 4_500, 5_500],
    ['20 % sooner at the lowest jitter', 30, 0, 11_500, 12_500],
    ['20 % later at the highest jitter', 30, 1, 17_500, 18_500],
  ] as const)('asks again at the %s', async (_, playedSecondsAgo, random, notYet, by) => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.spyOn(Math, 'random').mockReturnValue(random);
    let calls = 0;
    server.use(
      http.get(URL_NP, () => {
        calls++;
        const np = makeNowPlaying();
        np.now_playing.played_at = Math.floor(Date.now() / 1000) - playedSecondsAgo;
        np.now_playing.duration = 180;
        return HttpResponse.json(np);
      })
    );
    start();
    await vi.waitFor(() => expect(calls).toBe(1));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(notYet);
    });
    expect(calls).toBe(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(by - notYet);
    });
    expect(calls).toBe(2);
  });

  it('treats a defensive 304 (e.g. CDN ETag revalidation) as healthy and keeps current data', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let calls = 0;
    server.use(
      http.get(URL_NP, () => {
        calls++;
        if (calls === 1) {
          return HttpResponse.json(makeNowPlaying());
        }
        return new HttpResponse(null, { status: 304 });
      })
    );
    start();
    const { result } = renderHook(() => useNowPlayingStore((s) => s));
    await vi.waitFor(() => expect(result.current.data?.now_playing.song.title).toBe('Test Title'));
    // Test payload uses 2024 played_at -> remaining < 0 -> NEAR_END cadence (5s)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_500);
    });
    expect(calls).toBe(2);
    expect(result.current.data?.now_playing.song.title).toBe('Test Title');
    expect(result.current.isConnected).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it('never sends If-Modified-Since (would trigger a CORS preflight nginx returns 405 for)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const sentHeaders: Array<Record<string, string>> = [];
    server.use(
      http.get(URL_NP, ({ request }) => {
        const entries: Record<string, string> = {};
        request.headers.forEach((value, key) => {
          entries[key.toLowerCase()] = value;
        });
        sentHeaders.push(entries);
        return HttpResponse.json(freshNowPlaying());
      })
    );
    start();
    const { result } = renderHook(() => useNowPlayingStore((s) => s));
    await vi.waitFor(() => expect(result.current.data).not.toBeNull());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(16_000);
    });
    expect(sentHeaders.length).toBeGreaterThanOrEqual(2);
    for (const headers of sentHeaders) {
      expect(headers['if-modified-since']).toBeUndefined();
      expect(headers['if-none-match']).toBeUndefined();
    }
  });
});

// ─────────────────────────────────────────────
// Adaptive polling cadence
// ─────────────────────────────────────────────

describe('nowPlaying store — adaptive cadence', () => {
  it('falls back to DEFAULT_POLL_MS (10s) before any data is loaded', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let calls = 0;
    // A 304 keeps the connection healthy without giving data: the store stays empty.
    server.use(
      http.get(URL_NP, () => {
        calls++;
        return new HttpResponse(null, { status: 304 });
      })
    );
    start();
    await vi.waitFor(() => expect(calls).toBe(1));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(9_500);
    });
    expect(calls).toBe(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(calls).toBe(2);
    expect(useNowPlayingStore.getState().data).toBeNull();
  });
});

// ─────────────────────────────────────────────
// Error backoff
// ─────────────────────────────────────────────

describe('nowPlaying store — backoff', () => {
  it('backs off exponentially on consecutive failures (1s, 2s, 4s, ...)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    let calls = 0;
    server.use(
      http.get(URL_NP, () => {
        calls++;
        return new HttpResponse(null, { status: 500 });
      })
    );
    start();
    await vi.waitFor(() => expect(calls).toBe(1));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(calls).toBe(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    expect(calls).toBe(3);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4_000);
    });
    expect(calls).toBe(4);
  });

  it('asks again at once on Réessayer, rather than wait out the backoff', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    let calls = 0;
    server.use(
      http.get(URL_NP, () => {
        calls++;
        return new HttpResponse(null, { status: 500 });
      })
    );
    start();
    await vi.waitFor(() => expect(calls).toBe(1));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
      await vi.advanceTimersByTimeAsync(2_000);
    });
    expect(calls).toBe(3);

    // The next poll is 4 s away; Réessayer asks now, then starts the backoff again from 1 s.
    await act(async () => {
      retryNowPlaying();
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(calls).toBe(4);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(calls).toBe(5);
  });

  it('resets backoff after a successful response', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    let calls = 0;
    server.use(
      http.get(URL_NP, () => {
        calls++;
        if (calls === 1) return new HttpResponse(null, { status: 500 });
        return HttpResponse.json(freshNowPlaying());
      })
    );
    start();
    const { result } = renderHook(() => useNowPlayingStore((s) => s));
    await vi.waitFor(() => expect(calls).toBe(1));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    await vi.waitFor(() => expect(result.current.data).not.toBeNull());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    expect(calls).toBe(3);
  });
});

// ─────────────────────────────────────────────
// Visibility-aware
// ─────────────────────────────────────────────

describe('nowPlaying store — visibility', () => {
  function fireVisibility(hidden: boolean) {
    setHidden(hidden);
    document.dispatchEvent(new Event('visibilitychange'));
  }

  it('pauses the loop when the tab becomes hidden', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let calls = 0;
    server.use(
      http.get(URL_NP, () => {
        calls++;
        return HttpResponse.json(makeNowPlaying());
      })
    );
    start();
    await vi.waitFor(() => expect(calls).toBe(1));
    act(() => fireVisibility(true));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(calls).toBe(1);
    act(() => fireVisibility(false));
  });

  it('resumes immediately on visibilitychange visible', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let calls = 0;
    server.use(
      http.get(URL_NP, () => {
        calls++;
        return HttpResponse.json(makeNowPlaying());
      })
    );
    start();
    await vi.waitFor(() => expect(calls).toBe(1));
    act(() => fireVisibility(true));
    act(() => fireVisibility(false));
    await vi.waitFor(() => expect(calls).toBe(2));
  });
});
