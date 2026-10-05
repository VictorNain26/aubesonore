import type { KeptArtistPage } from '@aubesonore/shared-types/client';
import type { LikedTrack } from '../lib/api';

export interface ArtistGroup {
  key: string;
  name: string;
  /** The artist's page; null for a track the antenna is not known to have played. */
  page: KeptArtistPage | null;
  /** Newest first. */
  tracks: LikedTrack[];
}

/**
 * The kept tracks under their artist, the artist kept most recently first. A track is placed by
 * the artist it is tied to (`artistId`), so "Daft Punk feat. Pharrell" sits with Daft Punk; an
 * untied track goes under the name it was kept with.
 */
export function groupByArtist(tracks: readonly LikedTrack[]): ArtistGroup[] {
  const newestFirst = [...tracks].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const groups = new Map<string, ArtistGroup>();
  for (const track of newestFirst) {
    const key = track.artistId ?? `name:${track.artist.trim().toLowerCase()}`;
    const group = groups.get(key);
    if (group) {
      group.tracks.push(track);
      continue;
    }
    const page = track.artistPage ?? null;
    groups.set(key, { key, name: page?.name ?? track.artist, page, tracks: [track] });
  }
  return [...groups.values()];
}
