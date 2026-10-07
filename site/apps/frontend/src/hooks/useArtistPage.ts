import type { ArtistPageRef } from '@aubesonore/shared-types/client';
import { useEffect, useState } from 'react';
import { resolveArtistPage } from '../lib/artistProfile';

/**
 * The page of an artist heard on the antenna, or `null` while it resolves or
 * when the artist has none: a link is only shown once it leads somewhere.
 */
export function useArtistPage(artist: string | undefined): ArtistPageRef | null {
  const [resolved, setResolved] = useState<{
    artist: string;
    page: ArtistPageRef | null;
  } | null>(null);

  useEffect(() => {
    if (!artist) return;
    // The request is shared with every part of the page that shows this artist: the next track
    // leaves it to them and only stops listening.
    let current = true;
    resolveArtistPage(artist)
      .then((page) => {
        if (current) setResolved({ artist, page });
      })
      .catch(() => {
        // Offline: no link rather than a dead one.
      });
    return () => {
      current = false;
    };
  }, [artist]);

  // Derived, so a page resolved for the previous track never shows on this one.
  return resolved !== null && resolved.artist === artist ? resolved.page : null;
}
