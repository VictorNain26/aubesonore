import { afterAll, beforeAll, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import type { ArtistPhoto, ArtistSummary } from '@aubesonore/shared-types/client';
import { db, pool } from '../db';
import { artist, artistProfile, artistSlug } from '../db/schema';
import type { Lookup } from '../lib/lookup';
import { assertTestDatabase, emptyArtistTables, installMusilogyRanks, setRanks } from '../test/pg';
import * as commons from './commonsService';
import * as musicbrainz from './musicbrainzService';
import * as musilogy from './musilogyService';
import * as wikipedia from './wikipediaService';
import { getArtistProfile } from './artistProfileService';
import { ownerOfSlug } from './artistSlugs';

const MBID = '00000000-0000-4000-8000-000000000001';
const UNPLAYED = '00000000-0000-4000-8000-000000000002';
const DAY_MS = 24 * 60 * 60 * 1000;

const PHOTO: ArtistPhoto = {
  url: 'https://upload.wikimedia.org/a.jpg',
  width: 1280,
  height: 853,
  credit: {
    author: 'A',
    licence: 'CC BY 2.0',
    licenceUrl: null,
    source: 'https://commons.wikimedia.org/wiki/File:A.jpg',
  },
};
const summary = (lang: 'fr' | 'en'): ArtistSummary => ({
  text: `Opening ${lang}.`,
  lang,
  url: `https://${lang}.wikipedia.org/wiki/A`,
});
const identity = (name: string): musilogy.ArtistIdentity => ({
  name,
  facts: { kind: 'group', place: null, country: 'FR', formed: 1995, ended: null, active: true },
  links: [],
  wikidataId: 'Q1',
  firstCover: null,
  deezerId: null,
  records: 3,
});

// The boundaries: musilogy's dump (its SQL is tested in musilogy), Commons, Wikipedia,
// MusicBrainz. What the page stores and how it finds itself are the real database's.
let identities: Record<string, musilogy.ArtistIdentity | 'down'> = {};
let photoAnswer: Lookup<ArtistPhoto> = { status: 'found', value: PHOTO };
const spies = {
  identity: spyOn(musilogy, 'getArtistIdentity').mockImplementation((mbid) => {
    const known = identities[mbid];
    if (known === 'down') return Promise.reject(new musilogy.MusilogyUnavailable('42883'));
    return Promise.resolve(known ?? null);
  }),
  photo: spyOn(commons, 'getPhoto').mockImplementation(() => Promise.resolve(photoAnswer)),
  summary: spyOn(wikipedia, 'getSummary').mockImplementation((_id, locale) =>
    Promise.resolve({ status: 'found', value: summary(locale) })
  ),
  mbid: spyOn(musicbrainz, 'findMbidByDeezerId').mockResolvedValue({ status: 'none' }),
};

beforeAll(async () => {
  await assertTestDatabase();
  await installMusilogyRanks();
});

beforeEach(async () => {
  await emptyArtistTables();
  await setRanks({ [MBID]: 1, [UNPLAYED]: 1 });
  identities = { [MBID]: identity('Air'), [UNPLAYED]: identity('Blur') };
  photoAnswer = { status: 'found', value: PHOTO };
  for (const spy of Object.values(spies)) spy.mockClear();
});

afterAll(async () => {
  for (const spy of Object.values(spies)) spy.mockRestore();
  await pool.end();
});

/** A played artist with its MBID, its page at `air`. */
async function playedAir() {
  await db.insert(artist).values({
    id: 'a-air',
    normalizedName: 'air',
    displayName: 'Air',
    mbid: MBID,
  });
  await db.insert(artistSlug).values({ slug: 'air', mbid: MBID });
}

const stored = () => db.select().from(artistProfile);

/** Waits for what the refresh behind the answer does, two seconds at most. */
async function until(done: () => boolean | Promise<boolean>): Promise<void> {
  for (let waited = 0; !(await done()); waited += 10) {
    if (waited > 2_000) throw new Error('the refresh behind the answer never came');
    await Bun.sleep(10);
  }
}

describe("a played artist's page", () => {
  it('asks every source on the first view, in both languages, and stores the answers', async () => {
    await playedAir();

    const profile = await getArtistProfile('air', 'fr');

    expect(profile).toMatchObject({
      id: 'a-air',
      name: 'Air',
      slug: 'air',
      mbid: MBID,
      played: true,
      images: [{ kind: 'photo', ...PHOTO }],
      summary: summary('fr'),
    });
    expect(spies.summary).toHaveBeenCalledTimes(2);
    expect(await stored()).toMatchObject([
      { artistId: 'a-air', photo: PHOTO, summaryFr: summary('fr'), summaryEn: summary('en') },
    ]);
  });

  it('serves a fresh stored profile without asking any live source', async () => {
    await playedAir();
    await getArtistProfile('air', 'fr');
    for (const spy of Object.values(spies)) spy.mockClear();

    expect((await getArtistProfile('air', 'en'))?.summary).toEqual(summary('en'));
    expect(spies.photo).not.toHaveBeenCalled();
    expect(spies.summary).not.toHaveBeenCalled();
  });

  it('serves a stale profile at once and refreshes it behind the answer', async () => {
    await playedAir();
    await db.insert(artistProfile).values({
      artistId: 'a-air',
      photo: null,
      summaryFr: summary('fr'),
      summaryEn: null,
      refreshedAt: new Date(Date.now() - 8 * DAY_MS),
    });

    // Commons holds its answer until the test lets it go: the page must not wait for it.
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    spies.photo.mockImplementationOnce(async () => {
      await held;
      return { status: 'found', value: PHOTO };
    });

    const profile = await getArtistProfile('air', 'fr');

    // As stored, while the refresh still waits on Commons behind it.
    expect(profile?.images).toEqual([]);
    expect((await stored())[0]?.photo).toBeNull();
    release();
    await until(async () => (await stored())[0]?.photo !== null);
    expect((await stored())[0]?.photo).toEqual(PHOTO);
  });

  it('keeps a section as stored when its source fails, and stays stale', async () => {
    await playedAir();
    const old = new Date(Date.now() - 8 * DAY_MS);
    await db.insert(artistProfile).values({
      artistId: 'a-air',
      photo: PHOTO,
      summaryFr: null,
      summaryEn: null,
      refreshedAt: old,
    });
    photoAnswer = { status: 'failed' };

    await getArtistProfile('air', 'fr');
    // The refresh asked all three sources, then wrote what it kept.
    await until(() => spies.summary.mock.calls.length === 2);
    await until(async () => ((await stored())[0]?.summaryFr ?? null) !== null);

    const [row] = await stored();
    expect(row?.photo).toEqual(PHOTO);
    expect(row?.refreshedAt.getTime()).toBe(old.getTime());
  });

  it('answers by its MBID and by an older slug of its row, giving the address to send to', async () => {
    await playedAir();
    await db.insert(artistSlug).values({ slug: 'air-old', artistId: 'a-air' });

    expect((await getArtistProfile(MBID, 'fr'))?.slug).toBe('air');
    expect((await getArtistProfile('air-old', 'fr'))?.slug).toBe('air');
    expect(await getArtistProfile('nobody', 'fr')).toBeNull();
  });

  it('answers without facts, from what it stored, while musilogy is down', async () => {
    await playedAir();
    await getArtistProfile('air', 'fr');
    identities[MBID] = 'down';
    spies.summary.mockClear();

    const profile = await getArtistProfile('air', 'fr');

    expect(profile).toMatchObject({ name: 'Air', facts: null, summary: summary('fr') });
    // Its opening is the stored one: no live source was asked.
    expect(spies.summary).not.toHaveBeenCalled();
  });

  it('is named by the MBID a view finds for it, through the slug its row held', async () => {
    // Bound by its Deezer artist only: the view finds its MBID, whose page takes the row's slug.
    await db
      .insert(artist)
      .values({ id: 'a-air', normalizedName: 'air', displayName: 'Air', deezerId: '27' });
    await db.insert(artistSlug).values({ slug: 'air', artistId: 'a-air' });
    spies.mbid.mockResolvedValueOnce({ status: 'found', value: MBID });

    const profile = await getArtistProfile('air', 'fr');

    expect(profile).toMatchObject({ slug: 'air', summary: summary('fr') });
    expect(await ownerOfSlug('air')).toEqual({ mbid: MBID });
  });
});

describe("a page the antenna never played (today's behaviour, which the profile's refactor changes)", () => {
  it('is made at each view from the live answers, in the page language; no profile is stored, its slug is', async () => {
    await getArtistProfile(UNPLAYED, 'fr');
    const profile = await getArtistProfile(UNPLAYED, 'fr');

    expect(profile).toMatchObject({
      id: UNPLAYED,
      name: 'Blur',
      slug: 'blur',
      played: false,
      images: [{ kind: 'photo', ...PHOTO }],
      summary: summary('fr'),
    });
    // One opening per view, in the page language only.
    expect(spies.summary).toHaveBeenCalledTimes(2);
    expect(spies.summary.mock.calls.every(([, locale]) => locale === 'fr')).toBe(true);
    expect(await stored()).toEqual([]);
  });

  it('cannot answer while musilogy is down', async () => {
    identities[UNPLAYED] = 'down';

    const failure = await getArtistProfile(UNPLAYED, 'fr').catch((err: unknown) => err);
    expect(failure).toBeInstanceOf(musilogy.MusilogyUnavailable);
  });

  it('is gone with its dump entry: an MBID the dump does not hold has no page', async () => {
    delete identities[UNPLAYED];

    expect(await getArtistProfile(UNPLAYED, 'fr')).toBeNull();
  });
});

describe('the page of a played artist without an MBID', () => {
  it('is named by its row and has neither facts nor live answers', async () => {
    await db
      .insert(artist)
      .values({ id: 'a-x', normalizedName: 'x', displayName: 'X', mbid: null });
    await db.insert(artistSlug).values({ slug: 'x', artistId: 'a-x' });

    const profile = await getArtistProfile('x', 'fr');

    expect(profile).toMatchObject({
      id: 'a-x',
      name: 'X',
      slug: 'x',
      mbid: null,
      images: [],
      facts: null,
      summary: null,
    });
    expect(spies.identity).not.toHaveBeenCalled();
    expect(spies.photo).not.toHaveBeenCalled();
    expect(spies.summary).not.toHaveBeenCalled();
  });
});
