import { describe, expect, it } from 'vitest';
import type { LikedTrack } from '../lib/api';
import { groupByArtist } from './groups';

function kept(values: Partial<LikedTrack> & Pick<LikedTrack, 'id' | 'createdAt'>): LikedTrack {
  return {
    userId: 'u1',
    title: `Title ${values.id}`,
    artist: 'Artist',
    album: null,
    artworkUrl: null,
    youtubeUrl: 'https://www.youtube.com/results?search_query=x',
    isrc: null,
    songlinkUrl: null,
    platformLinks: null,
    artistId: null,
    ...values,
  };
}

const daftPunk = { slug: 'daft-punk', name: 'Daft Punk' };

describe('groupByArtist', () => {
  it('puts the tracks tied to one artist together, under the name of its page', () => {
    const groups = groupByArtist([
      kept({
        id: '1',
        createdAt: '2026-10-01',
        artist: 'Daft Punk',
        artistId: 'a',
        artistPage: daftPunk,
      }),
      kept({
        id: '2',
        createdAt: '2026-10-02',
        artist: 'Daft Punk feat. Pharrell Williams',
        artistId: 'a',
        artistPage: daftPunk,
      }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]!.name).toBe('Daft Punk');
    expect(groups[0]!.page).toEqual(daftPunk);
    expect(groups[0]!.tracks.map((t) => t.id)).toEqual(['2', '1']);
  });

  it('orders the artists by the track kept most recently', () => {
    const groups = groupByArtist([
      kept({ id: '1', createdAt: '2026-10-01', artistId: 'a', artistPage: daftPunk }),
      kept({ id: '2', createdAt: '2026-10-03', artist: 'Air', artistId: 'b' }),
      kept({ id: '3', createdAt: '2026-10-02', artistId: 'a', artistPage: daftPunk }),
    ]);

    expect(groups.map((g) => g.key)).toEqual(['b', 'a']);
  });

  it('groups untied tracks by the name they were kept with, without a page', () => {
    const groups = groupByArtist([
      kept({ id: '1', createdAt: '2026-10-01', artist: 'Kavinsky' }),
      kept({ id: '2', createdAt: '2026-10-02', artist: 'kavinsky' }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]!.name).toBe('kavinsky');
    expect(groups[0]!.page).toBeNull();
    expect(groups[0]!.tracks).toHaveLength(2);
  });

  it('keeps a tied artist without a page as text', () => {
    const [group] = groupByArtist([kept({ id: '1', createdAt: '2026-10-01', artistId: 'a' })]);

    expect(group!.page).toBeNull();
    expect(group!.name).toBe('Artist');
  });
});
