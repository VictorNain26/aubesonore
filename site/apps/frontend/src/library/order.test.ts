import { describe, expect, it } from 'vitest';
import type { LikedTrack } from '../lib/api';
import { DEFAULT_SORT, filterKept, nextSort, sortKept } from './order';

function kept(
  id: string,
  artist: string,
  createdAt: string,
  values: Partial<LikedTrack> = {}
): LikedTrack {
  return {
    id,
    userId: 'u1',
    title: `Title ${id}`,
    artist,
    album: null,
    artworkUrl: null,
    youtubeUrl: 'https://www.youtube.com/results?search_query=x',
    isrc: null,
    songlinkUrl: null,
    platformLinks: null,
    artistId: null,
    createdAt,
    ...values,
  };
}

const ids = (tracks: LikedTrack[]) => tracks.map((t) => t.id);

describe('sortKept', () => {
  const tracks = [
    kept('1', 'Kavinsky', '2026-10-01', { title: 'nightcall' }),
    kept('2', 'Daft Punk feat. Pharrell Williams', '2026-10-03', {
      title: 'Get Lucky',
      artistPage: { slug: 'daft-punk', name: 'Daft Punk' },
    }),
    kept('3', 'Étienne Daho', '2026-10-02', { title: 'Épaule Tattoo' }),
    kept('4', 'Daft Punk', '2026-10-04', {
      title: 'One More Time',
      artistPage: { slug: 'daft-punk', name: 'Daft Punk' },
    }),
    kept('5', 'air', '2026-09-01', { title: 'Sexy Boy' }),
  ];

  it('puts the track kept most recently first, or last when reversed', () => {
    expect(ids(sortKept(tracks, DEFAULT_SORT, 'fr'))).toEqual(['4', '2', '3', '1', '5']);
    expect(ids(sortKept(tracks, { key: 'added', dir: 'asc' }, 'fr'))).toEqual([
      '5',
      '1',
      '3',
      '2',
      '4',
    ]);
  });

  it('orders titles as a reader would, ignoring case and accents', () => {
    expect(ids(sortKept(tracks, { key: 'title', dir: 'asc' }, 'fr'))).toEqual([
      '3',
      '2',
      '1',
      '4',
      '5',
    ]);
    expect(ids(sortKept(tracks, { key: 'title', dir: 'desc' }, 'fr'))).toEqual([
      '5',
      '4',
      '1',
      '2',
      '3',
    ]);
  });

  it('orders by the artist of the page, newest first within one artist either way', () => {
    expect(ids(sortKept(tracks, { key: 'artist', dir: 'asc' }, 'fr'))).toEqual([
      '5',
      '4',
      '2',
      '3',
      '1',
    ]);
    expect(ids(sortKept(tracks, { key: 'artist', dir: 'desc' }, 'fr'))).toEqual([
      '1',
      '3',
      '4',
      '2',
      '5',
    ]);
  });

  it('leaves the given list as it was', () => {
    sortKept(tracks, { key: 'artist', dir: 'asc' }, 'fr');
    expect(ids(tracks)).toEqual(['1', '2', '3', '4', '5']);
  });
});

describe('nextSort', () => {
  it('starts a column in its own order: newest first, A to Z', () => {
    expect(nextSort(DEFAULT_SORT, 'artist')).toEqual({ key: 'artist', dir: 'asc' });
    expect(nextSort({ key: 'title', dir: 'desc' }, 'added')).toEqual(DEFAULT_SORT);
  });

  it('reverses the column that already sorts the list', () => {
    expect(nextSort(DEFAULT_SORT, 'added')).toEqual({ key: 'added', dir: 'asc' });
    expect(nextSort({ key: 'title', dir: 'asc' }, 'title')).toEqual({ key: 'title', dir: 'desc' });
  });
});

describe('filterKept', () => {
  const tracks = [
    kept('1', 'Étienne Daho', '2026-10-01', { title: 'Week-end à Rome' }),
    kept('2', 'Daft Punk feat. Pharrell Williams', '2026-10-02', {
      title: 'Get Lucky',
      artistPage: { slug: 'daft-punk', name: 'Daft Punk' },
    }),
    kept('3', 'Kavinsky', '2026-10-03', { title: 'Nightcall' }),
  ];

  it('keeps every track for an empty or blank query', () => {
    expect(ids([...filterKept(tracks, '  ', 'fr')])).toEqual(['1', '2', '3']);
  });

  it('finds a title or an artist, accents and case aside', () => {
    expect(ids([...filterKept(tracks, 'etienne', 'fr')])).toEqual(['1']);
    expect(ids([...filterKept(tracks, 'NIGHT', 'fr')])).toEqual(['3']);
    expect(ids([...filterKept(tracks, 'pharrell', 'fr')])).toEqual(['2']);
  });

  it('finds nothing when nothing holds the query', () => {
    expect(filterKept(tracks, 'cassius', 'fr')).toEqual([]);
  });
});
