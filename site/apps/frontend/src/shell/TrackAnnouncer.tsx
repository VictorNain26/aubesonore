import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useNowPlayingStore } from '../lib/azuracast';
import * as m from '@/paraglide/messages.js';

interface Track {
  /** The play's id (AzuraCast's sh_id): a title corrected during the same play is no new track. */
  id: number;
  title: string;
  artist: string;
}

/**
 * The next track, said to screen readers as the live moves on (WCAG 4.1.3): one polite region for
 * the whole site, outside the bar, which is inert while the hero shows. Empty for the track the
 * page opened on, which the hero or the bar already shows, and off air.
 */
export function TrackAnnouncer({ track }: { track: Track | null }) {
  const key = track ? track.id : null;
  const [firstKey, setFirstKey] = useState<number | null>(null);
  const [hasMoved, setHasMoved] = useState(false);
  if (firstKey === null && key !== null) setFirstKey(key);
  if (!hasMoved && firstKey !== null && key !== firstKey) setHasMoved(true);
  const said = track && hasMoved;
  return (
    <p role="status" aria-live="polite" className="sr-only">
      {said ? m.now_announce({ title: track.title, artist: track.artist }) : null}
    </p>
  );
}

/** The track on air, from the station's store. */
export function LiveTrackAnnouncer() {
  const { id, title, artist, isOnline } = useNowPlayingStore(
    useShallow((s) => ({
      id: s.data?.now_playing?.sh_id,
      title: s.data?.now_playing?.song.title,
      artist: s.data?.now_playing?.song.artist,
      isOnline: s.data?.is_online ?? true,
    }))
  );
  return (
    <TrackAnnouncer
      track={id !== undefined && title && artist && isOnline ? { id, title, artist } : null}
    />
  );
}
