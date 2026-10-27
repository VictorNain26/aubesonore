// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { makeNowPlaying } from '../mocks/handlers';
import { useNowPlayingStore } from '../lib/azuracast';
import { __resetNowPlayingStore } from '../lib/azuracast/store';
import type { NowPlaying, SongEntry } from '../lib/azuracast';
import { usePreviousTrack } from './usePreviousTrack';

function historyEntry(sh_id: number, playedAt: number): SongEntry {
  return {
    sh_id,
    played_at: playedAt,
    duration: 200,
    playlist: 'main',
    streamer: '',
    is_request: false,
    song: {
      id: String(sh_id),
      art: '',
      text: '',
      artist: 'Artist',
      title: `Track ${sh_id}`,
      album: '',
      genre: '',
      isrc: '',
      lyrics: '',
    },
  };
}

function onAir(now: SongEntry, history: SongEntry[] = []) {
  const np = makeNowPlaying() as unknown as NowPlaying;
  np.now_playing = now;
  np.song_history = history;
  useNowPlayingStore.setState({ data: np, isConnected: true, error: null });
}

beforeEach(() => {
  __resetNowPlayingStore();
});

afterEach(() => {
  vi.useRealTimers();
  __resetNowPlayingStore();
});

describe('usePreviousTrack', () => {
  it('is the newest track of the live history that is not the one on air', () => {
    const now = Math.floor(Date.now() / 1000);
    // The history as the station sends it, the track on air sometimes already in it.
    onAir(historyEntry(5, now - 10), [
      historyEntry(5, now - 10),
      historyEntry(2, now - 200),
      historyEntry(3, now - 50),
    ]);

    const { result } = renderHook(() => usePreviousTrack());

    expect(result.current?.sh_id).toBe(3);
  });

  it('is still the evening track just after midnight: no day is kept', () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 2, 0, 3) });
    const midnight = Math.floor(new Date(2026, 9, 2).getTime() / 1000);
    onAir(historyEntry(9, midnight + 60), [historyEntry(8, midnight - 120)]);

    expect(renderHook(() => usePreviousTrack()).result.current?.sh_id).toBe(8);
  });

  it('is none before the station has answered, or when nothing played before', () => {
    expect(renderHook(() => usePreviousTrack()).result.current).toBeNull();

    const now = Math.floor(Date.now() / 1000);
    onAir(historyEntry(1, now), [historyEntry(1, now)]);
    expect(renderHook(() => usePreviousTrack()).result.current).toBeNull();
  });

  it('is none off air: an hours-old track is not « just before » anything', () => {
    const now = Math.floor(Date.now() / 1000);
    onAir(historyEntry(5, now - 10), [historyEntry(4, now - 300)]);
    useNowPlayingStore.setState((s) => ({ data: s.data && { ...s.data, is_online: false } }));
    expect(renderHook(() => usePreviousTrack()).result.current).toBeNull();
  });

  it('is none while no track is on air', () => {
    const now = Math.floor(Date.now() / 1000);
    onAir(historyEntry(5, now - 10), [historyEntry(4, now - 300)]);
    useNowPlayingStore.setState((s) => ({
      data: s.data && { ...s.data, now_playing: undefined as unknown as NowPlaying['now_playing'] },
    }));
    expect(renderHook(() => usePreviousTrack()).result.current).toBeNull();
  });

  it('is the track before the one the hero shows, while the last one is still leaving', () => {
    const now = Math.floor(Date.now() / 1000);
    // The live has moved on to 6; the hero still shows 5 for a moment.
    onAir(historyEntry(6, now), [historyEntry(5, now - 200), historyEntry(4, now - 400)]);
    const shown = historyEntry(5, now - 200);
    expect(renderHook(() => usePreviousTrack(shown)).result.current?.sh_id).toBe(4);
  });
});
