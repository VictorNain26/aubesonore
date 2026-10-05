import type { LikedTrack } from '../lib/api';

/** A column of « Mes titres » and its direction: the date added, the title, or the artist. */
export type SortKey = 'added' | 'title' | 'artist';
export interface KeptSort {
  key: SortKey;
  dir: 'asc' | 'desc';
}

/** Where a column starts: the newest first, titles and artists from A to Z. */
export const firstDir = (key: SortKey): KeptSort['dir'] => (key === 'added' ? 'desc' : 'asc');

export const DEFAULT_SORT: KeptSort = { key: 'added', dir: 'desc' };

/** A click on a column: its own order first, reversed when it already sorts the list. */
export function nextSort(current: KeptSort, key: SortKey): KeptSort {
  if (current.key === key) return { key, dir: current.dir === 'asc' ? 'desc' : 'asc' };
  return { key, dir: firstDir(key) };
}

/** The name a kept track's artist goes by: its page's, so "Daft Punk feat. Pharrell" files under Daft Punk. */
export function artistNameOf(track: LikedTrack): string {
  return track.artistPage?.name ?? track.artist;
}

const newestFirst = (a: LikedTrack, b: LikedTrack) => b.createdAt.localeCompare(a.createdAt);

/**
 * The kept tracks in the order of one column. Titles and artists follow the reading order of
 * `locale` (case and accents aside); tracks tied on one are newest first, whichever the direction.
 */
export function sortKept(
  tracks: readonly LikedTrack[],
  sort: KeptSort,
  locale: string
): LikedTrack[] {
  const sign = sort.dir === 'asc' ? 1 : -1;
  if (sort.key === 'added') return [...tracks].sort((a, b) => -sign * newestFirst(a, b));
  const collator = new Intl.Collator(locale, { sensitivity: 'base', numeric: true });
  const nameOf = sort.key === 'title' ? (t: LikedTrack) => t.title : artistNameOf;
  return [...tracks].sort(
    (a, b) => sign * collator.compare(nameOf(a), nameOf(b)) || newestFirst(a, b)
  );
}

const searchable = (text: string, locale: string) =>
  text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase(locale);

/** The kept tracks whose title or artist holds `query`, accents and case aside ("etienne" finds "Étienne"). */
export function filterKept(
  tracks: readonly LikedTrack[],
  query: string,
  locale: string
): readonly LikedTrack[] {
  const needle = searchable(query.trim(), locale);
  if (!needle) return tracks;
  return tracks.filter((track) =>
    [track.title, track.artist, artistNameOf(track)].some((text) =>
      searchable(text, locale).includes(needle)
    )
  );
}
