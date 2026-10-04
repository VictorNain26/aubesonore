import { describe, it, expect, mock, spyOn, afterAll, beforeEach } from 'bun:test';

interface ArtistRow {
  id: string;
  displayName: string;
  normalizedName: string;
  slug: string;
  deezerId: string | null;
  mbid: string | null;
}

const baseRow: ArtistRow = {
  id: 'artist-1',
  displayName: 'Daft Punk',
  normalizedName: 'daft punk',
  slug: 'daft-punk',
  deezerId: '27',
  mbid: null,
};

let rows: ArtistRow[] = [baseRow];
let mbidWrites: Array<Record<string, unknown>> = [];

const realSchema = await import('../db/schema');

void mock.module('../db', () => ({
  schema: realSchema,
  db: {
    select: () => ({
      from: () => ({ where: () => ({ limit: () => Promise.resolve(rows) }) }),
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

const facts = {
  kind: 'group' as const,
  place: 'Paris',
  country: 'FR',
  formed: 1993,
  ended: 2021,
  active: false,
};

const spies = {
  deezer: spyOn(deezer, 'getArtist').mockResolvedValue({
    id: '27',
    name: 'Daft Punk',
    picture: 'https://cdn.deezer.com/dp.jpg',
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
    },
  }),
  summary: spyOn(wikipedia, 'getSummary').mockResolvedValue({
    text: 'Daft Punk est un groupe français de musique électronique.',
    lang: 'fr',
    url: 'https://fr.wikipedia.org/wiki/Daft_Punk',
  }),
  plays: spyOn(radioPlays, 'getPlaysByArtist').mockResolvedValue([
    { title: 'Around the World', artist: 'Daft Punk', playedAt: '2026-07-27T10:00:00.000Z' },
  ]),
};

afterAll(() => {
  for (const spy of Object.values(spies)) spy.mockRestore();
});

const { getArtistProfile } = await import('./artistProfileService');

beforeEach(() => {
  rows = [baseRow];
  mbidWrites = [];
  for (const spy of Object.values(spies)) spy.mockClear();
});

describe('getArtistProfile', () => {
  it('composes every source into one profile, in the page language', async () => {
    const profile = await getArtistProfile('artist-1', 'en');

    expect(profile).toEqual({
      id: 'artist-1',
      name: 'Daft Punk',
      slug: 'daft-punk',
      image: 'https://cdn.deezer.com/dp.jpg',
      facts,
      summary: {
        text: 'Daft Punk est un groupe français de musique électronique.',
        lang: 'fr',
        url: 'https://fr.wikipedia.org/wiki/Daft_Punk',
      },
      links: [
        { platform: 'deezer', url: 'https://www.deezer.com/artist/27' },
        { platform: 'official', url: 'https://daftpunk.com/' },
      ],
      playedOnRadio: [
        { title: 'Around the World', artist: 'Daft Punk', playedAt: '2026-07-27T10:00:00.000Z' },
      ],
    });
    expect(spies.mbid).toHaveBeenCalledWith('27');
    expect(spies.summary).toHaveBeenCalledWith('Q185828', 'en');
  });

  it('keeps the MBID it found, the bridge to Musilogy', async () => {
    await getArtistProfile('artist-1', 'fr');

    expect(mbidWrites).toEqual([{ mbid: 'mb-1' }]);
  });

  it('reads a stored MBID instead of looking it up again', async () => {
    rows = [{ ...baseRow, mbid: 'mb-1' }];

    const profile = await getArtistProfile('artist-1', 'fr');

    expect(spies.mbid).not.toHaveBeenCalled();
    expect(profile?.facts).toEqual(facts);
  });

  it('asks Wikipedia nothing when MusicBrainz knows no such Deezer artist', async () => {
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
    rows = [{ ...baseRow, deezerId: null }];

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
