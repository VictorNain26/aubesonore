import { useMemo } from 'react';
import { useNowPlayingStore, type SongEntry } from '../lib/azuracast';
import type { Loaded } from '../lib/homeData';
import { isToday } from '../home/time';

/**
 * Every track played today, newest first, with the track on air at the top: the day as the home
 * page's loader brought it (null while it has not come), the live payload keeping the top fresh.
 */
export function useTodayHistory(history: Loaded<SongEntry[]> | null): {
  entries: SongEntry[];
  isLoading: boolean;
  error: string | null;
} {
  const nowPlaying = useNowPlayingStore((s) => s.data?.now_playing);
  const liveHistory = useNowPlayingStore((s) => s.data?.song_history);
  const entries = useMemo(() => {
    const seen = new Set<number>();
    const fetched = history === null || history === 'failed' ? [] : history;
    return [...(nowPlaying ? [nowPlaying] : []), ...(liveHistory ?? []), ...fetched]
      .filter((e) => {
        if (seen.has(e.sh_id) || !isToday(e.played_at)) return false;
        seen.add(e.sh_id);
        return true;
      })
      .sort((a, b) => b.played_at - a.played_at);
  }, [nowPlaying, liveHistory, history]);

  return {
    entries,
    isLoading: history === null,
    error: history === 'failed' ? 'unavailable' : null,
  };
}
