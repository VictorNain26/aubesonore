import type { LikedTrack } from '../lib/api';

export type KeptOrder = 'date' | 'artist';

/** The name a kept track's artist goes by: its page's, so "Daft Punk feat. Pharrell" files under Daft Punk. */
export function artistNameOf(track: LikedTrack): string {
  return track.artistPage?.name ?? track.artist;
}

const newestFirst = (a: LikedTrack, b: LikedTrack) => b.createdAt.localeCompare(a.createdAt);

/** The kept tracks newest first, or by artist name in the reading order of `locale`, newest first within one artist. */
export function orderKept(
  tracks: readonly LikedTrack[],
  order: KeptOrder,
  locale: string
): LikedTrack[] {
  if (order === 'date') return [...tracks].sort(newestFirst);
  const collator = new Intl.Collator(locale, { sensitivity: 'base', numeric: true });
  return [...tracks].sort(
    (a, b) => collator.compare(artistNameOf(a), artistNameOf(b)) || newestFirst(a, b)
  );
}
