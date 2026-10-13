import { describe, it, expect, afterEach } from 'bun:test';

const { radioRoutes } = await import('./radio.routes');
const { radioHistoryCache } = await import('../services/radioService');
const { __resetRateLimits } = await import('../lib/rateLimit');

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  radioHistoryCache.delete('120');
  radioHistoryCache.delete('400');
  radioHistoryCache.dispose();
  __resetRateLimits();
});

describe('GET /api/radio/history', () => {
  it('defaults rows to 120 and returns the AzuraCast payload', async () => {
    let capturedUrl = '';
    globalThis.fetch = ((url: string) => {
      capturedUrl = url;
      return Promise.resolve(
        new Response(JSON.stringify({ page: 1, per_page: 120, rows: [{ sh_id: 1 }] }), {
          status: 200,
        })
      );
    }) as unknown as typeof fetch;

    const res = await radioRoutes.handle(new Request('http://localhost/api/radio/history'));

    expect(res.status).toBe(200);
    expect(capturedUrl).toContain('per_page=120');
    expect(await res.json()).toEqual([{ sh_id: 1 }]);
  });

  it('clamps an out-of-range rows query to the max', async () => {
    let capturedUrl = '';
    globalThis.fetch = ((url: string) => {
      capturedUrl = url;
      return Promise.resolve(new Response(JSON.stringify({ rows: [] }), { status: 200 }));
    }) as unknown as typeof fetch;

    await radioRoutes.handle(new Request('http://localhost/api/radio/history?rows=9999'));

    expect(capturedUrl).toContain('per_page=400');
  });

  it('returns 502 when AzuraCast is unreachable', async () => {
    globalThis.fetch = (() => {
      throw new Error('connect ECONNREFUSED');
    }) as unknown as typeof fetch;

    const res = await radioRoutes.handle(new Request('http://localhost/api/radio/history?rows=1'));

    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBeTruthy();
  });

  it('rounds the rows asked up to a step, so a caller cannot fan out one call per count', async () => {
    const asked: string[] = [];
    globalThis.fetch = ((url: string) => {
      asked.push(url);
      return Promise.resolve(new Response(JSON.stringify({ rows: [] }), { status: 200 }));
    }) as unknown as typeof fetch;

    for (const rows of [101, 120, 149, 150]) {
      await radioRoutes.handle(new Request(`http://localhost/api/radio/history?rows=${rows}`));
    }

    expect(asked).toHaveLength(1);
    expect(asked[0]).toContain('per_page=150');
  });

  it('answers 429 past its budget per address', async () => {
    globalThis.fetch = (() =>
      Promise.resolve(
        new Response(JSON.stringify({ rows: [] }), { status: 200 })
      )) as unknown as typeof fetch;
    const ask = () =>
      radioRoutes.handle(
        new Request('http://localhost/api/radio/history', {
          headers: { 'cf-connecting-ip': '203.0.113.9' },
        })
      );

    for (let i = 0; i < 60; i++) expect((await ask()).status).toBe(200);
    expect((await ask()).status).toBe(429);
  });
});
