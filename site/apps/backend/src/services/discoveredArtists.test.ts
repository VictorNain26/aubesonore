import { afterAll, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import type { MusilogyArtist, MusilogyNeighbour } from '@aubesonore/shared-types/client';

// The stored set, in memory: what discovered_artist holds.
let stored: { mbid: string }[] = [];
const db = {
  delete: () => {
    stored = [];
    return Promise.resolve();
  },
  insert: () => ({
    values: (rows: { mbid: string }[]) => {
      stored = [...rows];
      return Promise.resolve();
    },
  }),
  select: () => ({ from: () => Promise.resolve(stored) }),
  transaction: <T>(work: (tx: unknown) => Promise<T>) => work(db),
};
void mock.module('../db', () => ({ db }));

const pages = await import('./artistPages');
const musilogy = await import('./musilogyService');
const { isDiscovered, listDiscovered, loadDiscovered, refreshDiscovered, MIN_PLAYED_LINKS } =
  await import('./discoveredArtists');

const ref = (mbid: string, played = false): MusilogyNeighbour => ({
  mbid,
  name: mbid,
  disambiguation: null,
  y0: null,
  played: played ? { id: mbid, slug: mbid } : null,
  yEnd: null,
  ended: false,
  rank: 1,
  term: 'Krautrock',
});

function page(close: MusilogyNeighbour[], releases = 0): MusilogyArtist {
  return {
    card: {} as MusilogyArtist['card'],
    neighbours: close,
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

// Played pages: every one links to "rich" and "no-wikidata" and "few-records", exactly as many as
// the rule asks to "just-enough", one fewer to "one-short", and each to a played artist and to
// "rich" twice.
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
  played.forEach((mbid, i) => {
    pagesByMbid[mbid] = page([
      ref('rich'),
      ref('rich'),
      ref('no-wikidata'),
      ref('few-records'),
      ...(i < MIN_PLAYED_LINKS ? [ref('just-enough')] : []),
      ...(i < MIN_PLAYED_LINKS - 1 ? [ref('one-short')] : []),
      ref('p0', true),
    ]);
  });
  wikidata = {
    rich: 'Q1',
    'no-wikidata': null,
    'few-records': 'Q2',
    'just-enough': 'Q3',
    'one-short': 'Q4',
  };
  stored = [];
}

const playedSpy = spyOn(pages, 'listPlayedMbids').mockImplementation(() => Promise.resolve(played));
const pageSpy = spyOn(musilogy, 'getMusilogyArtist').mockImplementation((mbid: string) =>
  Promise.resolve(pagesByMbid[mbid] ?? null)
);
const identitySpy = spyOn(musilogy, 'getArtistIdentity').mockImplementation((mbid: string) =>
  Promise.resolve(
    mbid in wikidata
      ? ({
          wikidataId: wikidata[mbid],
          records: pagesByMbid[mbid]?.releases?.length ?? 0,
        } as Awaited<ReturnType<typeof musilogy.getArtistIdentity>>)
      : null
  )
);

afterAll(() => {
  playedSpy.mockRestore();
  pageSpy.mockRestore();
  identitySpy.mockRestore();
});

beforeEach(world);

describe('discovered artists', () => {
  it('keeps the artists linked from enough played pages, with a Wikidata item and records', async () => {
    await refreshDiscovered();

    expect(listDiscovered()).toEqual(['just-enough', 'rich']);
    expect(isDiscovered('rich')).toBe(true);
    expect(isDiscovered('just-enough')).toBe(true);
    expect(isDiscovered('one-short')).toBe(false);
    expect(isDiscovered('no-wikidata')).toBe(false);
    expect(isDiscovered('few-records')).toBe(false);
    expect(isDiscovered('p0')).toBe(false);
    expect(isDiscovered(null)).toBe(false);
  });

  it('keeps the last set when a run fails', async () => {
    await refreshDiscovered();
    pageSpy.mockImplementationOnce(() => Promise.reject(new Error('3F000')));

    const failure = await refreshDiscovered().then(
      () => null,
      (err: unknown) => err
    );

    expect(failure).toBeInstanceOf(Error);

    expect(listDiscovered()).toEqual(['just-enough', 'rich']);
  });

  it("serves the stored set after a restart, before the day's run", async () => {
    await refreshDiscovered();
    stored = [{ mbid: 'rich' }];

    await loadDiscovered();

    expect(listDiscovered()).toEqual(['rich']);
  });
});
