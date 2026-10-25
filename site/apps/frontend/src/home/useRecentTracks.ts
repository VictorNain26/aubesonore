import { useMemo } from 'react';
import { useNowPlayingStore, type SongEntry } from '../lib/azuracast';
import type { Loaded } from '../lib/homeData';

/** The thread holds the last eight tracks: the one that played comes in, the oldest goes. */
const THREAD_LENGTH = 8;

/**
 * The tracks played before the one on air, newest first, eight at most: the history as the home
 * page's loader brought it (null while it has not come), the live payload keeping it fresh. The
 * track on air is left out (the player above shows it). No day is kept: just after midnight the
 * evening is still there.
 */
export function useRecentTracks(history: Loaded<SongEntry[]> | null): {
  entries: SongEntry[];
  isLoading: boolean;
  error: string | null;
} {
  const nowPlaying = useNowPlayingStore((s) => s.data?.now_playing);
  const liveHistory = useNowPlayingStore((s) => s.data?.song_history);
  const nowId = nowPlaying?.sh_id;
  const entries = useMemo(() => {
    const seen = new Set<number>(nowId === undefined ? [] : [nowId]);
    const fetched = history === null || history === 'failed' ? [] : history;
    return [...(liveHistory ?? []), ...fetched]
      .filter((e) => {
        if (seen.has(e.sh_id)) return false;
        seen.add(e.sh_id);
        return true;
      })
      .sort((a, b) => b.played_at - a.played_at)
      .slice(0, THREAD_LENGTH);
  }, [nowId, liveHistory, history]);

  return {
    entries,
    isLoading: history === null,
    error: history === 'failed' ? 'unavailable' : null,
  };
}
