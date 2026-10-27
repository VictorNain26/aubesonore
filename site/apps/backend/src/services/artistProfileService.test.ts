import { describe, it, expect, mock, spyOn, afterAll, beforeEach } from 'bun:test';
import type { artist, artistProfile } from '../db/schema';

type ArtistRow = typeof artist.$inferSelect;
type StoredProfile = typeof artistProfile.$inferSelect;

const baseRow: ArtistRow = {
  id: 'artist-1',
  displayName: 'Daft Punk',
  normalizedName: 'daft punk',
  deezerId: '27',
  mbid: 'mb-1',
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
const HOMEWORK_COVER = {
  url: 'https://coverartarchive.org/release-group/homework/front-500',
  title: 'Homework',
  year: 1997,
};
const PHOTO = {
  url: 'https://upload.wikimedia.org/wikipedia/commons/d/dp/Daft_Punk.jpg',
  width: 1280,
  height: 853,
  credit: {
    author: 'Jane Doe',
    licence: 'CC BY-SA 4.0',
    licenceUrl: 'https://creativecommons.org/licenses/by-sa/4.0',
    source: 'https://commons.wikimedia.org/wiki/File:Daft_Punk.jpg',
  },
};
const STORED_PHOTO = {
  ...PHOTO,
  url: 'https://upload.wikimedia.org/wikipedia/commons/s/st/Stored.jpg',
};

let rows: Array<{ artist: ArtistRow; artist_profile: StoredProfile | null }> = [];
// The slugs of MBID pages; a played artist's row is at 'daft-punk' (artistSlugs).
let slugRows: Array<{ slug: string; mbid: string }> = [];
let stored: StoredProfile[] = [];

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
  },
}));

// spyOn on the real exports, restored after this file: mock.module would
// replace these modules for every other test file of the run (Bun 1.3).
const commons = await import('./commonsService');
const musilogy = await import('./musilogyService');
const wikipedia = await import('./wikipediaService');
const slugs = await import('./artistSlugs');

const spies = {
  photo: spyOn(commons, 'getPhoto').mockResolvedValue({ status: 'found', value: PHOTO }),
  identity: spyOn(musilogy, 'getArtistIdentity').mockResolvedValue({
    name: 'Daft Punk',
    deezerId: '27',
    facts,
    links: [{ platform: 'official', url: 'https://daftpunk.com/' }],
    wikidataId: 'Q185828',
    firstCover: HOMEWORK_COVER,
    records: 1,
  }),
  summary: spyOn(wikipedia, 'getSummary').mockImplementation((_id, locale) =>
    Promise.resolve({ status: 'found', value: locale === 'fr' ? summaryFr : summaryEn })
  ),
  owner: spyOn(slugs, 'ownerOfSlug').mockImplementation((slug) => {
    const page = slugRows.find((row) => row.slug === slug);
    if (page) return Promise.resolve({ mbid: page.mbid });
    const row = rows[0];
    return Promise.resolve(slug === 'daft-punk' && row ? { artistId: row.artist.id } : null);
  }),
  slugsFor: spyOn(slugs, 'slugsFor').mockImplementation(() =>
    Promise.resolve(new Map(slugRows.map((row) => [row.mbid, row.slug])))
  ),
  pageSlug: spyOn(slugs, 'slugOfArtistPage').mockResolvedValue('daft-punk'),
  bind: spyOn(slugs, 'bindArtistSlug').mockResolvedValue(),
};

afterAll(() => {
  for (const spy of Object.values(spies)) spy.mockRestore();
});

const { getArtistProfile } = await import('./artistProfileService');

function storedProfile(values: Partial<StoredProfile> = {}): StoredProfile {
  return {
    artistId: 'artist-1',
    photo: STORED_PHOTO,
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
  slugRows = [];
  for (const spy of Object.values(spies)) spy.mockClear();
});

describe('getArtistProfile', () => {
  it('asks every source on the first view, answers in the page language and stores it', async () => {
    const profile = await getArtistProfile('daft-punk', 'en');

    expect(profile).toEqual({
      id: 'artist-1',
      name: 'Daft Punk',
      slug: 'daft-punk',
      mbid: 'mb-1',
      played: true,
      images: [
        { kind: 'photo', ...PHOTO },
        { kind: 'cover', ...HOMEWORK_COVER },
      ],
      facts,
      summary: summaryEn,
      links: [
        { platform: 'deezer', url: 'https://www.deezer.com/artist/27' },
        { platform: 'official', url: 'https://daftpunk.com/' },
      ],
    });
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ summaryFr, summaryEn });
    expect(spies.summary).toHaveBeenCalledWith('Q185828', 'fr');
    expect(spies.photo).toHaveBeenCalledWith('Q185828');
    expect(spies.identity).toHaveBeenCalledWith('mb-1');
    expect(stored[0]!.refreshedAt.getTime()).toBeGreaterThan(LONG_AGO.getTime());
  });

  it("asks no source for the MBID of a row without one: identity is the resolver's", async () => {
    rows = [{ artist: { ...baseRow, mbid: null }, artist_profile: null }];

    const profile = await getArtistProfile('daft-punk', 'fr');

    expect(spies.identity).not.toHaveBeenCalled();
    expect(profile?.links).toEqual([
      { platform: 'deezer', url: 'https://www.deezer.com/artist/27' },
    ]);
  });

  it('serves a fresh stored profile without asking any live source', async () => {
    rows = [{ artist: baseRow, artist_profile: storedProfile() }];

    const profile = await getArtistProfile('daft-punk', 'fr');

    expect(profile?.images[0]).toEqual({ kind: 'photo', ...STORED_PHOTO });
    expect(profile?.summary).toEqual(summaryFr);
    expect(profile?.facts).toEqual(facts);
    expect(spies.photo).not.toHaveBeenCalled();
    expect(spies.summary).not.toHaveBeenCalled();
    expect(stored).toEqual([]);
  });

  it('reads the facts again from the dump at each view, not from what was stored', async () => {
    rows = [{ artist: baseRow, artist_profile: storedProfile() }];
    spies.identity.mockResolvedValueOnce({
      facts: { ...facts, ended: null, active: true },
      links: [],
      wikidataId: 'Q185828',
      firstCover: null,
      records: 0,
      name: 'Daft Punk',
      deezerId: '27',
    });

    const profile = await getArtistProfile('daft-punk', 'fr');

    expect(profile?.facts).toMatchObject({ ended: null, active: true });
    expect(profile?.links).toEqual([
      { platform: 'deezer', url: 'https://www.deezer.com/artist/27' },
    ]);
  });

  it('keeps the stored photo and openings and stays stale while musilogy is not loaded', async () => {
    // Without the dump, the item to ask is unknown: what was stored stays,
    // and the old date makes the next view try again.
    rows = [{ artist: baseRow, artist_profile: storedProfile({ refreshedAt: LONG_AGO }) }];
    spies.identity.mockRejectedValueOnce(new musilogy.MusilogyUnavailable('3F000'));

    const profile = await getArtistProfile('daft-punk', 'fr');
    await settle();

    expect(profile?.facts).toBeNull();
    expect(profile?.links).toEqual([
      { platform: 'deezer', url: 'https://www.deezer.com/artist/27' },
    ]);
    expect(profile?.summary).toEqual(summaryFr);
    expect(stored[0]).toMatchObject({
      photo: STORED_PHOTO,
      summaryFr,
      summaryEn,
      refreshedAt: LONG_AGO,
    });
    expect(spies.summary).not.toHaveBeenCalled();
    expect(spies.photo).not.toHaveBeenCalled();
  });

  it('serves a stale profile at once and refreshes it behind the answer', async () => {
    rows = [{ artist: baseRow, artist_profile: storedProfile({ refreshedAt: LONG_AGO }) }];

    const profile = await getArtistProfile('daft-punk', 'fr');
    await settle();

    expect(profile?.images[0]).toEqual({ kind: 'photo', ...STORED_PHOTO });
    expect(stored).toHaveLength(1);
    expect(stored[0]!.photo).toEqual(PHOTO);
  });

  it('keeps a section as stored when its source fails, and stays stale', async () => {
    rows = [{ artist: baseRow, artist_profile: storedProfile({ refreshedAt: LONG_AGO }) }];
    spies.photo.mockResolvedValueOnce({ status: 'failed' });

    await getArtistProfile('daft-punk', 'fr');
    await settle();

    expect(stored[0]!.photo).toEqual(STORED_PHOTO);
    expect(stored[0]!.refreshedAt).toEqual(LONG_AGO);
  });

  it('clears a section its source no longer knows', async () => {
    spies.identity.mockResolvedValueOnce(null);

    const profile = await getArtistProfile('daft-punk', 'fr');

    expect(profile?.facts).toBeNull();
    expect(profile?.summary).toBeNull();
    expect(profile?.links).toEqual([
      { platform: 'deezer', url: 'https://www.deezer.com/artist/27' },
    ]);
    expect(spies.summary).not.toHaveBeenCalled();
  });

  it("shows the first record's cover when Commons has no photo", async () => {
    spies.photo.mockResolvedValueOnce({ status: 'none' });

    expect((await getArtistProfile('daft-punk', 'fr'))?.images).toEqual([
      { kind: 'cover', ...HOMEWORK_COVER },
    ]);
  });

  it('still answers when the artist matched no upstream', async () => {
    rows = [{ artist: { ...baseRow, deezerId: null, mbid: null }, artist_profile: null }];

    const profile = await getArtistProfile('daft-punk', 'fr');

    expect(profile?.images).toEqual([]);
    expect(profile?.facts).toBeNull();
    expect(profile?.links).toEqual([]);
  });

  it("serves an MBID's page at its slug, the address its MBID sends to", async () => {
    rows = [];
    const MBID = '056e4f3e-d505-4dad-8ec1-d04f521cbb56';
    slugRows = [{ slug: 'daft-punk', mbid: MBID }];

    const bySlug = await getArtistProfile('daft-punk', 'fr');
    const byMbid = await getArtistProfile(MBID, 'fr');

    expect(bySlug?.slug).toBe('daft-punk');
    expect(bySlug?.mbid).toBe(MBID);
    expect(bySlug?.played).toBe(false);
    // Its MBID names the same page, at that address: the route sends the reader there.
    expect(byMbid?.slug).toBe('daft-punk');
  });

  it('makes the page of an artist the antenna never played from Musilogy, at its MBID', async () => {
    rows = [];
    const MBID = '056e4f3e-d505-4dad-8ec1-d04f521cbb56';

    const profile = await getArtistProfile(MBID, 'en');

    expect(profile).toEqual({
      id: MBID,
      name: 'Daft Punk',
      slug: MBID,
      mbid: MBID,
      played: false,
      images: [
        { kind: 'photo', ...PHOTO },
        { kind: 'cover', ...HOMEWORK_COVER },
      ],
      facts,
      summary: summaryEn,
      links: [
        { platform: 'deezer', url: 'https://www.deezer.com/artist/27' },
        { platform: 'official', url: 'https://daftpunk.com/' },
      ],
    });
    expect(spies.identity).toHaveBeenCalledWith(MBID);
    expect(stored).toEqual([]);
  });

  it('shows the first record cover of an artist never played without a Wikidata item', async () => {
    rows = [];
    spies.identity.mockResolvedValueOnce({
      name: 'Protomartyr',
      deezerId: null,
      facts,
      links: [],
      wikidataId: null,
      firstCover: HOMEWORK_COVER,
      records: 1,
    });

    const profile = await getArtistProfile('8d3431db-bc83-4dc2-93b8-0e46e31d09f7', 'fr');

    expect(profile?.images).toEqual([{ kind: 'cover', ...HOMEWORK_COVER }]);
    expect(profile?.links).toEqual([]);
    expect(spies.photo).not.toHaveBeenCalled();
  });

  it('knows no page for an MBID the dump does not hold, nor for an unknown slug', async () => {
    rows = [];
    spies.identity.mockResolvedValueOnce(null);
    expect(await getArtistProfile('8d3431db-bc83-4dc2-93b8-0e46e31d09f7', 'fr')).toBeNull();

    spies.identity.mockClear();
    expect(await getArtistProfile('nobody', 'fr')).toBeNull();
    expect(spies.identity).not.toHaveBeenCalled();
  });

  it('returns null for an unknown id', async () => {
    rows = [];

    expect(await getArtistProfile('nope', 'fr')).toBeNull();
  });
});
