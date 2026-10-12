import { afterAll, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import type { MusilogyArtist, MusilogyNeighbour } from '@aubesonore/shared-types/client';

// In memory: the stored set (discovered_artist) and the slugs pages were given (artist_slug).
let stored: { mbid: string }[] = [];
let slugs: { slug: string; mbid: string }[] = [];
const db = {
  delete: () => {
    stored = [];
    return Promise.resolve();
  },
  insert: () => ({
    // The set, written whole; or a slug claimed, which a taken slug refuses.
    values: (rows: { mbid: string }[] | { slug: string; mbid: string }) => {
      if (Array.isArray(rows)) {
        stored = [...rows];
        return Promise.resolve();
      }
      const free = !slugs.some((row) => row.slug === rows.slug || row.mbid === rows.mbid);
      return {
        onConflictDoNothing: () => ({
          returning: () => {
            if (!free) return Promise.resolve([]);
            slugs.push(rows);
            return Promise.resolve([{ slug: rows.slug }]);
          },
        }),
      };
    },
  }),
  // The set (from), or the slugs of some pages (from…where).
  select: () => ({
    from: () => Object.assign(Promise.resolve(stored), { where: () => Promise.resolve(slugs) }),
  }),
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
  slug: null,
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
  slugs = [{ slug: 'rich', mbid: 'someone-else' }];
  richName = 'Rich';
}

const playedSpy = spyOn(pages, 'listPlayedMbids').mockImplementation(() => Promise.resolve(played));
const pageSpy = spyOn(musilogy, 'getMusilogyArtist').mockImplementation((mbid: string) =>
  Promise.resolve(pagesByMbid[mbid] ?? null)
);
let richName = 'Rich';
const identitySpy = spyOn(musilogy, 'getArtistIdentity').mockImplementation((mbid: string) =>
  Promise.resolve(
    mbid in wikidata
      ? ({
          wikidataId: wikidata[mbid],
          name: mbid === 'rich' ? richName : 'Just Enough',
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

  it('gives each new page a slug from its name, the next suffix when it is taken', async () => {
    const clear = spyOn(musilogy.musilogyCache, 'clear');
    await refreshDiscovered();

    // The played pages read before these slugs existed are read again, their links with them.
    expect(clear).toHaveBeenCalledTimes(1);
    clear.mockRestore();

    expect(slugs).toContainEqual({ slug: 'rich-2', mbid: 'rich' });
    expect(slugs).toContainEqual({ slug: 'just-enough', mbid: 'just-enough' });
  });

  it('leaves a page at its MBID when its name makes no slug the route takes, the others named', async () => {
    richName = 'x'.repeat(201);

    await refreshDiscovered();

    expect(slugs.some((row) => row.mbid === 'rich')).toBe(false);
    expect(slugs).toContainEqual({ slug: 'just-enough', mbid: 'just-enough' });
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
