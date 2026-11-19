import { afterAll, beforeAll, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import type { MusilogyArtist, MusilogyNeighbour } from '@aubesonore/shared-types/client';
import { sql } from 'drizzle-orm';
import { db, pool } from '../db';
import { artist, discoveredArtist } from '../db/schema';
import { assertTestDatabase, emptyArtistTables, installMusilogyRanks, setRanks } from '../test/pg';
import { slugsFor } from './artistSlugs';
import * as musilogy from './musilogyService';
import {
  isDiscovered,
  listDiscovered,
  listDiscoveredPages,
  loadDiscovered,
  MIN_PLAYED_LINKS,
  refreshDiscovered,
} from './discoveredArtists';

// The rows, the slugs and the stored set are Postgres's. Musilogy's pages are its boundary: its
// functions are another project's, loaded from its dumps, absent from the test database.
const mbid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const ref = (id: string, played = false): MusilogyNeighbour => ({
  mbid: id,
  name: id,
  disambiguation: null,
  y0: null,
  played: played ? { id, slug: id } : null,
  slug: null,
  yEnd: null,
  ended: false,
  rank: 1,
  term: 'Krautrock',
});

function page(close: MusilogyNeighbour[], releases = 0): MusilogyArtist {
  return {
    card: {} as MusilogyArtist['card'],
    sameSound: close,
    colisten: null,
    credits: null,
    releases: Array.from({ length: releases }, (_, i) => ({
      mbid: `rg${i}`,
      title: `r${i}`,
      type: 'album' as const,
      soundtrack: false,
      remix: false,
      year: null,
    })),
    bands: null,
    memberProjects: null,
    otherNames: null,
  };
}

// Played pages: every one links to "rich", "no-wikidata" and "few-records", exactly as many as the
// rule asks to "just-enough", one fewer to "one-short", and each to "rich" twice and to "p0", played,
// which would qualify otherwise.
const played = Array.from({ length: MIN_PLAYED_LINKS + 2 }, (_, i) => `p${i}`);
let pagesByMbid: Record<string, MusilogyArtist | null> = {};
let wikidata: Record<string, string | null> = {};

function world(): void {
  pagesByMbid = {
    rich: page([], 3),
    'no-wikidata': page([], 5),
    'few-records': page([], 2),
    'just-enough': page([], 3),
    'one-short': page([], 5),
  };
  played.forEach((id, i) => {
    pagesByMbid[id] = page(
      [
        ref('rich'),
        ref('rich'),
        ref('no-wikidata'),
        ref('few-records'),
        ...(i < MIN_PLAYED_LINKS ? [ref('just-enough')] : []),
        ...(i < MIN_PLAYED_LINKS - 1 ? [ref('one-short')] : []),
        ref('p0', true),
      ],
      3
    );
  });
  wikidata = {
    p0: 'Q0',
    rich: 'Q1',
    'no-wikidata': null,
    'few-records': 'Q2',
    'just-enough': 'Q3',
    'one-short': 'Q4',
  };
}

const pageSpy = spyOn(musilogy, 'getMusilogyArtist').mockImplementation((id: string) =>
  Promise.resolve(pagesByMbid[id] ?? null)
);
const identitySpy = spyOn(musilogy, 'getArtistIdentity').mockImplementation((id: string) =>
  Promise.resolve(
    id in wikidata
      ? ({
          wikidataId: wikidata[id],
          name: `${id} band`,
          records: pagesByMbid[id]?.releases?.length ?? 0,
        } as Awaited<ReturnType<typeof musilogy.getArtistIdentity>>)
      : null
  )
);

const stored = async () =>
  (await db.select().from(discoveredArtist).orderBy(discoveredArtist.mbid)).map((row) => row.mbid);

beforeAll(async () => {
  await assertTestDatabase();
  await installMusilogyRanks();
});

beforeEach(async () => {
  await emptyArtistTables();
  await db.execute(sql`TRUNCATE discovered_artist`);
  await setRanks({});
  world();
});

afterAll(async () => {
  pageSpy.mockRestore();
  identitySpy.mockRestore();
  await db.execute(sql`TRUNCATE discovered_artist`);
  await pool.end();
});

/**
 * The antenna's played artists, each with its MBID: the pages the links start from. The first has
 * no page in Musilogy yet, which the count passes over.
 */
async function playedArtists(): Promise<void> {
  await db
    .insert(artist)
    .values(
      ['gone', ...played].map((id) => ({ id, normalizedName: id, displayName: id, mbid: id }))
    );
}

describe('refreshDiscovered', () => {
  it('keeps the artists linked from enough played pages, with a Wikidata item and records', async () => {
    await playedArtists();
    await setRanks({ rich: 1, 'just-enough': 1 });

    await refreshDiscovered();

    expect(listDiscovered()).toEqual(['just-enough', 'rich']);
    for (const id of ['one-short', 'no-wikidata', 'few-records', 'p0'])
      expect(isDiscovered(id)).toBe(false);
    expect(isDiscovered(null)).toBe(false);
    // Stored for a restart, and each given its slug, by its name, for the sitemap.
    expect(await stored()).toEqual(['just-enough', 'rich']);
    expect(await listDiscoveredPages()).toEqual(['just-enough-band', 'rich-band']);
  });

  it('counts no link from the same public nor the credits, which the rule was not measured on', async () => {
    await playedArtists();
    const [first, second] = played;
    pagesByMbid['heard'] = page([], 5);
    wikidata['heard'] = 'Q5';
    pagesByMbid[first!] = { ...pagesByMbid[first!]!, colisten: [ref('heard')] };
    pagesByMbid[second!] = { ...pagesByMbid[second!]!, credits: [{ ...ref('heard'), records: 1 }] };

    await refreshDiscovered();

    expect(isDiscovered('heard')).toBe(false);
  });

  it('replaces the stored set with the new one, down to none', async () => {
    await playedArtists();
    await refreshDiscovered();

    wikidata['just-enough'] = null;
    await refreshDiscovered();
    expect(await stored()).toEqual(['rich']);

    wikidata['rich'] = null;
    await refreshDiscovered();
    expect(await stored()).toEqual([]);
    expect(listDiscovered()).toEqual([]);
  });

  it('keeps the last set, stored and served, when a run fails', async () => {
    await playedArtists();
    await refreshDiscovered();
    pageSpy.mockImplementationOnce(() => Promise.reject(new Error('3F000')));

    const failure = await refreshDiscovered().then(
      () => null,
      (err: unknown) => err
    );

    expect(failure).toBeInstanceOf(Error);
    expect(listDiscovered()).toEqual(['just-enough', 'rich']);
    expect(await stored()).toEqual(['just-enough', 'rich']);
  });
});

describe('listDiscoveredPages', () => {
  it('gives each discovered page at its slug, else at its MBID: the sitemap publishes them', async () => {
    await db.insert(discoveredArtist).values([{ mbid: mbid(1) }, { mbid: mbid(2) }]);
    await setRanks({ [mbid(1)]: 1 });
    await slugsFor([{ mbid: mbid(1), name: 'Shame' }]);
    await loadDiscovered();

    expect(await listDiscoveredPages()).toEqual([mbid(2), 'shame']);
  });
});
