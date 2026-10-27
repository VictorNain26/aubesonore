import { useNowPlayingStore, type SongEntry } from '../lib/azuracast';

/**
 * The track that played before `current` (by default the one on air; the hero passes the one it
 * still shows while the next comes in), from the live payload: the newest of its history that is
 * neither `current` nor after it (the station sometimes lists the track on air in it). None
 * before the station has answered, off air (an hours-old track is just before nothing), with no
 * track on air, or when nothing played before. No day is kept: just after midnight the evening's
 * track is still the one before.
 */
export function usePreviousTrack(
  current?: Pick<SongEntry, 'sh_id' | 'played_at'> | null
): SongEntry | null {
  return useNowPlayingStore((s) => {
    const shown = current ?? s.data?.now_playing;
    if (!s.data?.is_online || !shown) return null;
    let previous: SongEntry | null = null;
    for (const entry of s.data.song_history ?? []) {
      if (
        entry.sh_id !== shown.sh_id &&
        entry.played_at <= shown.played_at &&
        (!previous || entry.played_at > previous.played_at)
      )
        previous = entry;
    }
    return previous;
  });
}
