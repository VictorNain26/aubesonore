import { beforeEach, describe, expect, it, mock } from 'bun:test';

import * as realSchema from '../db/schema';
import { __resetRateLimits } from '../lib/rateLimit';
import type { TrendEntry, TrendsResult } from '@aubesonore/shared-types/client';

const weekRows: TrendEntry[] = [
  { title: 'Week Hit', artist: 'Artist A', artworkUrl: null, likes: 3, artistPage: null },
];
const payload: TrendsResult = { week: weekRows };
// The aggregate's rows: the service turns slug and name into artistPage.
const row = ({ artistPage: _page, ...entry }: TrendEntry) => ({ ...entry, slug: null, name: null });

// Stub the database boundary, not `../services/trendsService`: Bun keeps module
// mocks for the whole run even under `--isolate`, so a partial mock of the
// service would strip `trendsCache` from every test file loaded afterwards.
const fakeDb = {
  select: () => {
    const builder = {
      from: () => builder,
      leftJoin: () => builder,
      where: () => builder,
      groupBy: () => builder,
      orderBy: () => builder,
      limit: () => Promise.resolve(weekRows.map(row)),
    };
    return builder;
  },
};

void mock.module('../db/index', () => ({ db: fakeDb, schema: realSchema }));

const { trendsRoutes } = await import('./trends.routes');
const { trendsCache } = await import('../services/trendsService');

beforeEach(() => {
  __resetRateLimits();
  trendsCache.dispose();
});

describe('GET /api/trends', () => {
  it("returns the week's ranking, and no other", async () => {
    const res = await trendsRoutes.handle(new Request('http://localhost/api/trends'));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(payload);
  });

  it('rejects with 429 once the per-IP limit is exceeded', async () => {
    let res: Response | null = null;
    for (let i = 0; i < 31; i++) {
      res = await trendsRoutes.handle(new Request('http://localhost/api/trends'));
    }

    expect(res?.status).toBe(429);
    expect(res?.headers.get('retry-after')).toBe('60');
    expect(await res?.json()).toEqual({ error: 'Trop de requêtes, réessayez dans 1 minute' });
  });
});
