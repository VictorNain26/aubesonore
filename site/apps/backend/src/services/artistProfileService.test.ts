import { describe, it, expect, mock, spyOn, afterAll, beforeEach } from 'bun:test';
import type { artist, artistProfile } from '../db/schema';

type ArtistRow = typeof artist.$inferSelect;
type StoredProfile = typeof artistProfile.$inferSelect;

const baseRow: ArtistRow = {
  id: 'artist-1',
  displayName: 'Daft Punk',
  normalizedName: 'daft punk',
  slug: 'daft-punk',
  deezerId: '27',
  mbid: null,
  identifiedBy: 'isrc',
  firstSeenAt: new Date('2026-10-01T00:00:00Z'),
};

const facts = {
  kind: 'group' as const,
  place: 'Paris',
  country: 'FR',
  formed: 1993,
  ended: 2021,
  active: false,
};

const summaryFr = {
  text: 'Daft Punk est un groupe français de musique électronique.',
  lang: 'fr' as const,
  url: 'https://fr.wikipedia.org/wiki/Daft_Punk',
};
const summaryEn = {
  text: 'Daft Punk were a French electronic music duo.',
  lang: 'en' as const,
  url: 'https://en.wikipedia.org/wiki/Daft_Punk',
};

const LONG_AGO = new Date('2026-01-01T00:00:00Z');

let rows: Array<{ artist: ArtistRow; artist_profile: StoredProfile | null }> = [];
let stored: StoredProfile[] = [];
let mbidWrites: Array<Record<string, unknown>> = [];

const realSchema = await import('../db/schema');

void mock.module('../db', () => ({
  schema: realSchema,
  db: {
    select: () => ({
      from: () => ({
        leftJoin: () => ({ where: () => ({ limit: () => Promise.resolve(rows) }) }),
      }),
    }),
    insert: () => ({
      values: (values: StoredProfile) => ({
        onConflictDoUpdate: () => {
          stored.push(values);
          return Promise.resolve();
        },
      }),
    }),
    update: () => ({
      set: (values: Record<string, unknown>) => ({
        where: () => {
          mbidWrites.push(values);
          return Promise.resolve();
        },
      }),
    }),
  },
}));

// spyOn on the real exports, restored after this file: mock.module would
// replace these modules for every other test file of the run (Bun 1.3).
const deezer = await import('./deezerService');
const musicbrainz = await import('./musicbrainzService');
const radioPlays = await import('./radioPlayService');
const wikipedia = await import('./wikipediaService');

const spies = {
  deezer: spyOn(deezer, 'getArtist').mockResolvedValue({
    status: 'found',
    value: { id: '27', name: 'Daft Punk', picture: 'https://cdn.deezer.com/dp.jpg' },
  }),
  mbid: spyOn(musicbrainz, 'findMbidByDeezerId').mockResolvedValue({
    status: 'found',
    value: 'mb-1',
  }),
  musicbrainz: spyOn(musicbrainz, 'getArtistByMbid').mockResolvedValue({
    status: 'found',
    value: {
      facts,
      links: [{ platform: 'official', url: 'https://daftpunk.com/' }],
      wikidataId: 'Q185828',
      deezerId: '27',
    },
  }),
  summary: spyOn(wikipedia, 'getSummary').mockImplementation((_id, locale) =>
    Promise.resolve({ status: 'found', value: locale === 'fr' ? summaryFr : summaryEn })
  ),
  plays: spyOn(radioPlays, 'getPlaysByArtist').mockResolvedValue([
    { title: 'Around the World', artist: 'Daft Punk', playedAt: '2026-07-27T10:00:00.000Z' },
  ]),
};

afterAll(() => {
  for (const spy of Object.values(spies)) spy.mockRestore();
});

const { getArtistProfile } = await import('./artistProfileService');

function storedProfile(values: Partial<StoredProfile> = {}): StoredProfile {
  return {
    artistId: 'artist-1',
    image: 'https://cdn.deezer.com/stored.jpg',
    facts,
    links: [{ platform: 'official', url: 'https://daftpunk.com/' }],
    wikidataId: 'Q185828',
    summaryFr,
    summaryEn,
    refreshedAt: new Date(),
    ...values,
  };
}

// The refresh of a stale profile runs behind the answer.
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  rows = [{ artist: baseRow, artist_profile: null }];
  stored = [];
  mbidWrites = [];
  for (const spy of Object.values(spies)) spy.mockClear();
});

describe('getArtistProfile', () => {
  it('asks every source on the first view, answers in the page language and stores it', async () => {
    const profile = await getArtistProfile('artist-1', 'en');

    expect(profile).toEqual({
      id: 'artist-1',
      name: 'Daft Punk',
      slug: 'daft-punk',
      mbid: null,
      image: 'https://cdn.deezer.com/dp.jpg',
      facts,
      summary: summaryEn,
      links: [
        { platform: 'deezer', url: 'https://www.deezer.com/artist/27' },
        { platform: 'official', url: 'https://daftpunk.com/' },
      ],
      playedOnRadio: [
        { title: 'Around the World', artist: 'Daft Punk', playedAt: '2026-07-27T10:00:00.000Z' },
      ],
    });
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ summaryFr, summaryEn, wikidataId: 'Q185828' });
    expect(stored[0]!.refreshedAt.getTime()).toBeGreaterThan(LONG_AGO.getTime());
  });

  it('keeps the MBID it found, the bridge to Musilogy', async () => {
    await getArtistProfile('artist-1', 'fr');

    expect(mbidWrites).toEqual([{ mbid: 'mb-1' }]);
  });

  it('serves a fresh stored profile without asking any source', async () => {
    rows = [{ artist: baseRow, artist_profile: storedProfile() }];

    const profile = await getArtistProfile('artist-1', 'fr');

    expect(profile?.image).toBe('https://cdn.deezer.com/stored.jpg');
    expect(profile?.summary).toEqual(summaryFr);
    expect(spies.deezer).not.toHaveBeenCalled();
    expect(spies.musicbrainz).not.toHaveBeenCalled();
    expect(stored).toEqual([]);
  });

  it('serves a stale profile at once and refreshes it behind the answer', async () => {
    rows = [{ artist: baseRow, artist_profile: storedProfile({ refreshedAt: LONG_AGO }) }];

    const profile = await getArtistProfile('artist-1', 'fr');
    await settle();

    expect(profile?.image).toBe('https://cdn.deezer.com/stored.jpg');
    expect(stored).toHaveLength(1);
    expect(stored[0]!.image).toBe('https://cdn.deezer.com/dp.jpg');
  });

  it('keeps a section as stored when its source fails, and stays stale', async () => {
    rows = [{ artist: baseRow, artist_profile: storedProfile({ refreshedAt: LONG_AGO }) }];
    spies.deezer.mockResolvedValueOnce({ status: 'failed' });

    await getArtistProfile('artist-1', 'fr');
    await settle();

    expect(stored[0]!.image).toBe('https://cdn.deezer.com/stored.jpg');
    expect(stored[0]!.refreshedAt).toEqual(LONG_AGO);
  });

  it('clears a section its source no longer knows', async () => {
    spies.mbid.mockResolvedValueOnce({ status: 'none' });

    const profile = await getArtistProfile('artist-1', 'fr');

    expect(profile?.facts).toBeNull();
    expect(profile?.summary).toBeNull();
    expect(profile?.links).toEqual([
      { platform: 'deezer', url: 'https://www.deezer.com/artist/27' },
    ]);
    expect(spies.summary).not.toHaveBeenCalled();
  });

  it('keeps the radio floor when the artist matched no upstream', async () => {
    rows = [{ artist: { ...baseRow, deezerId: null }, artist_profile: null }];

    const profile = await getArtistProfile('artist-1', 'fr');

    expect(profile?.image).toBeNull();
    expect(profile?.facts).toBeNull();
    expect(profile?.links).toEqual([]);
    expect(profile?.playedOnRadio).toHaveLength(1);
  });

  it('returns null for an unknown id', async () => {
    rows = [];

    expect(await getArtistProfile('nope', 'fr')).toBeNull();
  });
});
