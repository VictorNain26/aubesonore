import { afterAll, beforeEach, describe, expect, it, spyOn } from 'bun:test';

import { __resetRateLimits } from '../lib/rateLimit';
import type { TrendsResult } from '@aubesonore/shared-types/client';
import * as trends from '../services/trendsService';
import { trendsRoutes } from './trends.routes';

// The ranking itself is trendsService's, tested against Postgres (trendsService.db.test.ts).
const payload: TrendsResult = {
  week: [{ title: 'Week Hit', artist: 'Artist A', artworkUrl: null, likes: 3, artistPage: null }],
};
const getTrends = spyOn(trends, 'getTrends').mockResolvedValue(payload);

beforeEach(() => {
  __resetRateLimits();
});

afterAll(() => {
  getTrends.mockRestore();
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
