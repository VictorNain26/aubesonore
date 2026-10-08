import { afterAll, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import type { MusilogyArtist, MusilogyNeighbour } from '@aubesonore/shared-types/client';

const pages = await import('./artistPages');
const musilogy = await import('./musilogyService');
const { isDiscovered, listDiscovered, refreshDiscovered, MIN_PLAYED_LINKS } =
  await import('./discoveredArtists');

const ref = (mbid: string, played = false): MusilogyNeighbour => ({
  mbid,
  name: mbid,
  disambiguation: null,
  y0: null,
  played: played ? { id: mbid, slug: mbid } : null,
  yEnd: null,
  score: 1,
  rank: 1,
});

function page(close: MusilogyNeighbour[], releases = 0): MusilogyArtist {
  return {
    card: {} as MusilogyArtist['card'],
    neighbours: { before: close, during: [], after: [], undated: [] },
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

// Played pages p0…p11: every one links to "rich" and "no-wikidata" and "few-records", p0…p8 to
// "nine-links", and each links to a played artist and to "rich" twice.
const played = Array.from({ length: MIN_PLAYED_LINKS + 2 }, (_, i) => `p${i}`);
let pagesByMbid: Record<string, MusilogyArtist | null> = {};
let wikidata: Record<string, string | null> = {};

function world(): void {
  pagesByMbid = {
    rich: page([], 3),
    'no-wikidata': page([], 5),
    'few-records': page([], 2),
    'nine-links': page([], 5),
  };
  played.forEach((mbid, i) => {
    pagesByMbid[mbid] = page([
      ref('rich'),
      ref('rich'),
      ref('no-wikidata'),
      ref('few-records'),
      ...(i < MIN_PLAYED_LINKS - 1 ? [ref('nine-links')] : []),
      ref('p0', true),
    ]);
  });
  wikidata = { rich: 'Q1', 'no-wikidata': null, 'few-records': 'Q2', 'nine-links': 'Q3' };
}

const playedSpy = spyOn(pages, 'listPlayedMbids').mockImplementation(() => Promise.resolve(played));
const pageSpy = spyOn(musilogy, 'getMusilogyArtist').mockImplementation((mbid: string) =>
  Promise.resolve(pagesByMbid[mbid] ?? null)
);
const identitySpy = spyOn(musilogy, 'getArtistIdentity').mockImplementation((mbid: string) =>
  Promise.resolve(
    mbid in wikidata
      ? ({ wikidataId: wikidata[mbid] } as Awaited<ReturnType<typeof musilogy.getArtistIdentity>>)
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

    expect(listDiscovered()).toEqual(['rich']);
    expect(isDiscovered('rich')).toBe(true);
    expect(isDiscovered('nine-links')).toBe(false);
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

    expect(listDiscovered()).toEqual(['rich']);
  });
});
