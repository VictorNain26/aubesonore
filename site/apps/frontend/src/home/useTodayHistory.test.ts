// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { makeNowPlaying } from '../mocks/handlers';
import { useNowPlayingStore } from '../lib/azuracast';
import { __resetNowPlayingStore } from '../lib/azuracast/store';
import type { NowPlaying, SongEntry } from '../lib/azuracast';
import { useTodayHistory } from './useTodayHistory';

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

beforeEach(() => {
  __resetNowPlayingStore();
  // Noon: entries a few minutes old stay "today" (just after midnight they
  // fell on the day before and the test failed).
  vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 2, 12, 0) });
});

afterEach(() => {
  vi.useRealTimers();
  __resetNowPlayingStore();
});

describe('useTodayHistory', () => {
  it('merges the day the loader brought with the live history, deduped by sh_id, newest first', () => {
    const now = Math.floor(Date.now() / 1000);
    const np = makeNowPlaying() as unknown as NowPlaying;
    np.now_playing = historyEntry(5, now - 10);
    np.song_history = [historyEntry(2, now - 200), historyEntry(3, now - 50)];
    useNowPlayingStore.setState({ data: np, isConnected: true, error: null });

    const { result } = renderHook(() =>
      useTodayHistory([historyEntry(1, now - 100), historyEntry(2, now - 200)])
    );

    expect(result.current.entries.map((e) => e.sh_id)).toEqual([5, 3, 1, 2]);
    expect(result.current).toMatchObject({ isLoading: false, error: null });
  });

  it('keeps only the tracks played today', () => {
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    const startOfDay = Math.floor(midnight.getTime() / 1000);

    const { result } = renderHook(() =>
      useTodayHistory([historyEntry(1, startOfDay + 60), historyEntry(2, startOfDay - 60)])
    );

    expect(result.current.entries.map((e) => e.sh_id)).toEqual([1]);
  });

  it('says it is loading while the day has not come, and failing when it did not answer', () => {
    const now = Math.floor(Date.now() / 1000);
    const np = makeNowPlaying() as unknown as NowPlaying;
    np.now_playing = historyEntry(8, now - 10);
    np.song_history = [historyEntry(9, now - 300)];
    useNowPlayingStore.setState({ data: np, isConnected: true, error: null });

    expect(renderHook(() => useTodayHistory(null)).result.current.isLoading).toBe(true);
    const failed = renderHook(() => useTodayHistory('failed')).result.current;
    expect(failed.error).not.toBeNull();
    // The live entries all the same.
    expect(failed.entries.map((e) => e.sh_id)).toEqual([8, 9]);
  });
});
