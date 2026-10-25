// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { makeNowPlaying } from '../mocks/handlers';
import { useNowPlayingStore } from '../lib/azuracast';
import { __resetNowPlayingStore } from '../lib/azuracast/store';
import type { NowPlaying, SongEntry } from '../lib/azuracast';
import { useRecentTracks } from './useRecentTracks';

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

describe('useRecentTracks', () => {
  it('merges what the loader brought with the live history, deduped by sh_id, newest first, without the track on air', () => {
    const now = Math.floor(Date.now() / 1000);
    onAir(historyEntry(5, now - 10), [historyEntry(2, now - 200), historyEntry(3, now - 50)]);

    const { result } = renderHook(() =>
      useRecentTracks([
        historyEntry(5, now - 10),
        historyEntry(1, now - 100),
        historyEntry(2, now - 200),
      ])
    );

    expect(result.current.entries.map((e) => e.sh_id)).toEqual([3, 1, 2]);
    expect(result.current).toMatchObject({ isLoading: false, error: null });
  });

  it('keeps the last eight', () => {
    const now = Math.floor(Date.now() / 1000);
    onAir(historyEntry(100, now));
    const played = Array.from({ length: 12 }, (_, i) => historyEntry(i + 1, now - (i + 1) * 200));

    const { result } = renderHook(() => useRecentTracks(played));

    expect(result.current.entries.map((e) => e.sh_id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('still shows the tracks of the evening just after midnight', () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 2, 0, 3) });
    const midnight = Math.floor(new Date(2026, 9, 2).getTime() / 1000);

    const { result } = renderHook(() =>
      useRecentTracks([historyEntry(1, midnight + 60), historyEntry(2, midnight - 120)])
    );

    expect(result.current.entries.map((e) => e.sh_id)).toEqual([1, 2]);
  });

  it('says it is loading while the history has not come, and failing when it did not answer', () => {
    const now = Math.floor(Date.now() / 1000);
    onAir(historyEntry(8, now - 10), [historyEntry(9, now - 300)]);

    expect(renderHook(() => useRecentTracks(null)).result.current.isLoading).toBe(true);
    const failed = renderHook(() => useRecentTracks('failed')).result.current;
    expect(failed.error).not.toBeNull();
    // The live feed's tracks all the same.
    expect(failed.entries.map((e) => e.sh_id)).toEqual([9]);
  });
});
