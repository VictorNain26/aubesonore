// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../../mocks/server';
import { makeNowPlaying } from '../../mocks/handlers';
import { useNowPlayingStore, startNowPlayingPolling, __resetNowPlayingStore } from './store';

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
  vi.restoreAllMocks();
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
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    start();
    const { result } = renderHook(() => useNowPlayingStore((s) => s));
    await waitFor(() => expect(result.current.error).toBe('HTTP 500'));
    expect(result.current.data).toBeNull();
    expect(result.current.isConnected).toBe(false);
    warnSpy.mockRestore();
  });

  it('logs and sets error on schema validation failure', async () => {
    server.use(http.get(URL_NP, () => HttpResponse.json({ broken: true })));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    start();
    const { result } = renderHook(() => useNowPlayingStore((s) => s));
    await waitFor(() => expect(result.current.error).toBe('invalid payload'));
    expect(result.current.data).toBeNull();
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
    warnSpy.mockRestore();
  });
});

// ─────────────────────────────────────────────
// Lifecycle
// ─────────────────────────────────────────────

describe('nowPlaying store — lifecycle', () => {
  it('a single startNowPlayingPolling drives many consumers from one fetch loop', async () => {
    let calls = 0;
    server.use(
      http.get(URL_NP, () => {
        calls++;
        return HttpResponse.json(makeNowPlaying());
      })
    );
    start();
    const a = renderHook(() => useNowPlayingStore((s) => s.data));
    const b = renderHook(() => useNowPlayingStore((s) => s.data));
    const c = renderHook(() => useNowPlayingStore((s) => s.data));
    await waitFor(() => expect(a.result.current).not.toBeNull());
    expect(calls).toBe(1);
    a.unmount();
    b.unmount();
    c.unmount();
  });

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

  it('startNowPlayingPolling is idempotent', async () => {
    let calls = 0;
    server.use(
      http.get(URL_NP, () => {
        calls++;
        return HttpResponse.json(makeNowPlaying());
      })
    );
    start();
    // Second start is a no-op; we should not see a duplicate first-fetch.
    startNowPlayingPolling();
    await vi.waitFor(() => expect(calls).toBe(1));
    expect(calls).toBe(1);
  });
});

// ─────────────────────────────────────────────
// Polling cadence
// ─────────────────────────────────────────────

describe('nowPlaying store — cadence', () => {
  it('uses the MID_TRACK cadence (~15s) when remaining is large', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let calls = 0;
    server.use(
      http.get(URL_NP, () => {
        calls++;
        return HttpResponse.json(freshNowPlaying());
      })
    );
    start();
    await vi.waitFor(() => expect(calls).toBe(1));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(14_000);
    });
    expect(calls).toBe(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000); // total 16s
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

  it('switches to NEAR_END cadence (~5s) when remaining < 20s', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let calls = 0;
    server.use(
      http.get(URL_NP, () => {
        calls++;
        const np = makeNowPlaying();
        np.now_playing.played_at = Math.floor(Date.now() / 1000) - 170;
        np.now_playing.duration = 180;
        return HttpResponse.json(np);
      })
    );
    start();
    await vi.waitFor(() => expect(calls).toBe(1));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4_500);
    });
    expect(calls).toBe(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000); // total 5.5s
    });
    expect(calls).toBe(2);
  });
});

// ─────────────────────────────────────────────
// Jitter
// ─────────────────────────────────────────────

describe('nowPlaying store — jitter', () => {
  it('applies negative jitter (Math.random=0) so intervals shorten by 20%', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.spyOn(Math, 'random').mockReturnValue(0); // jitter = -20%
    let calls = 0;
    server.use(
      http.get(URL_NP, () => {
        calls++;
        return HttpResponse.json(freshNowPlaying());
      })
    );
    start();
    await vi.waitFor(() => expect(calls).toBe(1));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(11_500);
    });
    expect(calls).toBe(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000); // total 12.5s
    });
    expect(calls).toBe(2);
  });

  it('applies positive jitter (Math.random=1) so intervals stretch by 20%', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.spyOn(Math, 'random').mockReturnValue(1); // jitter = +20%
    let calls = 0;
    server.use(
      http.get(URL_NP, () => {
        calls++;
        return HttpResponse.json(freshNowPlaying());
      })
    );
    start();
    await vi.waitFor(() => expect(calls).toBe(1));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(17_500);
    });
    expect(calls).toBe(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000); // total 18.5s
    });
    expect(calls).toBe(2);
  });
});

// ─────────────────────────────────────────────
// Error backoff
// ─────────────────────────────────────────────

describe('nowPlaying store — backoff', () => {
  it('backs off exponentially on consecutive failures (1s, 2s, 4s, ...)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
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
    warnSpy.mockRestore();
  });

  it('resets backoff after a successful response', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
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
    warnSpy.mockRestore();
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
