import { useNowPlayingStore, type SongEntry } from '../lib/azuracast';

/**
 * The track that played before the one on air, from the live payload: the newest of its history
 * that is not on air (the station sometimes lists the track on air in it). None before the
 * station has answered, off air (an hours-old track is just before nothing), with no track on
 * air, or when nothing played before. No day is kept: just after midnight the evening's track is
 * still the one before.
 */
export function usePreviousTrack(): SongEntry | null {
  return useNowPlayingStore((s) => {
    const nowId = s.data?.now_playing?.sh_id;
    if (!s.data?.is_online || nowId === undefined) return null;
    let previous: SongEntry | null = null;
    for (const entry of s.data?.song_history ?? []) {
      if (entry.sh_id !== nowId && (!previous || entry.played_at > previous.played_at))
        previous = entry;
    }
    return previous;
  });
}
