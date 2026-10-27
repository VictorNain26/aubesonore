import { beforeEach, describe, expect, it, mock } from 'bun:test';

import * as realSchema from '../db/schema';
import type { TrendEntry } from '@aubesonore/shared-types/client';

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

let selectCalls = 0;
let whereCalls = 0;

// Chainable fake matching the exact query shape trendsService builds:
// select().from().leftJoin().leftJoin().leftJoin().where().groupBy().orderBy().limit().
// The week's query is the only one: it has a `where` clause.
const fakeDb = {
  select: () => {
    selectCalls++;
    const builder = {
      from: () => builder,
      leftJoin: () => builder,
      where: () => {
        whereCalls++;
        return builder;
      },
      groupBy: () => builder,
      orderBy: () => builder,
      limit: (): Promise<Row[]> => Promise.resolve(weekRows),
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
  it("returns the week's ranking alone, from one aggregate query over the last seven days", async () => {
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
    expect(Object.keys(result)).toEqual(['week']);
    expect(selectCalls).toBe(1);
    expect(whereCalls).toBe(1);
  });

  it('serves the cached result on subsequent calls', async () => {
    await getTrends();
    const second = await getTrends();

    expect(selectCalls).toBe(1);
    expect(second.week[0]?.artistPage).toEqual({ slug: 'daft-punk', name: 'Daft Punk' });
  });

  it('runs the query once for concurrent calls on a cold cache', async () => {
    const [a, b, c] = await Promise.all([getTrends(), getTrends(), getTrends()]);

    expect(selectCalls).toBe(1);
    expect(b).toBe(a);
    expect(c).toBe(a);
  });

  it('re-queries after the cache entry is evicted', async () => {
    await getTrends();
    trendsCache.dispose();

    await getTrends();

    expect(selectCalls).toBe(2);
  });
});
