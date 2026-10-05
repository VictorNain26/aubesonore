import { beforeEach, describe, expect, it, mock } from 'bun:test';

import * as realSchema from '../db/schema';
import type { TrendEntry } from './trendsService';

// What the aggregate answers: the page's slug and name, null when the track is not tied to an
// artist with a page.
type Row = Omit<TrendEntry, 'artistPage'> & { slug: string | null; name: string | null };

const weekRows: Row[] = [
  {
    title: 'Week Hit',
    artist: 'Daft Punk feat. Pharrell Williams',
    artworkUrl: 'https://cdn.example.com/a.jpg',
    likes: 4,
    slug: 'daft-punk',
    name: 'Daft Punk',
  },
];
const allTimeRows: Row[] = [
  {
    title: 'All-Time Hit',
    artist: 'Artist B',
    artworkUrl: null,
    likes: 42,
    slug: null,
    name: null,
  },
];

let selectCalls = 0;
let whereCalls = 0;

// Chainable fake matching the exact query shape trendsService builds:
// select().from().leftJoin().leftJoin().$dynamic()[.where()].groupBy().orderBy().limit().
// Rows with a `where` clause stand in for the week query, rows without for all-time.
const fakeDb = {
  select: () => {
    selectCalls++;
    let filtered = false;
    const builder = {
      from: () => builder,
      leftJoin: () => builder,
      $dynamic: () => builder,
      where: () => {
        whereCalls++;
        filtered = true;
        return builder;
      },
      groupBy: () => builder,
      orderBy: () => builder,
      limit: (): Promise<Row[]> => Promise.resolve(filtered ? weekRows : allTimeRows),
    };
    return builder;
  },
};

void mock.module('../db/index', () => ({ db: fakeDb, schema: realSchema }));

const { getTrends, trendsCache } = await import('./trendsService');

beforeEach(() => {
  selectCalls = 0;
  whereCalls = 0;
  trendsCache.dispose();
});

describe('getTrends', () => {
  it('returns week and all-time rankings from two aggregate queries', async () => {
    const result = await getTrends();

    expect(result.week).toEqual([
      {
        title: 'Week Hit',
        artist: 'Daft Punk feat. Pharrell Williams',
        artworkUrl: 'https://cdn.example.com/a.jpg',
        likes: 4,
        artistPage: { slug: 'daft-punk', name: 'Daft Punk' },
      },
    ]);
    expect(result.allTime).toEqual([
      { title: 'All-Time Hit', artist: 'Artist B', artworkUrl: null, likes: 42, artistPage: null },
    ]);
    expect(selectCalls).toBe(2);
    expect(whereCalls).toBe(1);
  });

  it('serves the cached result on subsequent calls', async () => {
    await getTrends();
    const second = await getTrends();

    expect(selectCalls).toBe(2);
    expect(second.week[0]?.artistPage).toEqual({ slug: 'daft-punk', name: 'Daft Punk' });
  });

  it('re-queries after the cache entry is evicted', async () => {
    await getTrends();
    trendsCache.dispose();

    await getTrends();

    expect(selectCalls).toBe(4);
  });
});
