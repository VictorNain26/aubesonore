import { describe, expect, it } from 'vitest';
import type { LikedTrack } from '../lib/api';
import { orderKept } from './order';

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

describe('orderKept', () => {
  const tracks = [
    kept('1', 'Kavinsky', '2026-10-01'),
    kept('2', 'Daft Punk feat. Pharrell Williams', '2026-10-03', {
      artistPage: { slug: 'daft-punk', name: 'Daft Punk' },
    }),
    kept('3', 'Étienne Daho', '2026-10-02'),
    kept('4', 'Daft Punk', '2026-10-04', { artistPage: { slug: 'daft-punk', name: 'Daft Punk' } }),
    kept('5', 'air', '2026-09-01'),
  ];

  it('puts the track kept most recently first', () => {
    expect(ids(orderKept(tracks, 'date', 'fr'))).toEqual(['4', '2', '3', '1', '5']);
  });

  it('orders by artist as a reader would, ignoring case and accents, newest first within one', () => {
    expect(ids(orderKept(tracks, 'artist', 'fr'))).toEqual(['5', '4', '2', '3', '1']);
  });

  it('leaves the given list as it was', () => {
    orderKept(tracks, 'artist', 'fr');
    expect(ids(tracks)).toEqual(['1', '2', '3', '4', '5']);
  });
});
