import { describe, it, expect, afterEach } from 'bun:test';

const { getStationHistory, radioHistoryCache } = await import('./radioService');

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  radioHistoryCache.delete('120');
  radioHistoryCache.delete('5');
});

describe('getStationHistory', () => {
  it('fetches AzuraCast history with the API key header and station id in the path', async () => {
    let capturedUrl = '';
    let capturedHeaders: RequestInit['headers'];
    globalThis.fetch = ((url: string, init?: RequestInit) => {
      capturedUrl = url;
      capturedHeaders = init?.headers;
      return Promise.resolve(
        new Response(JSON.stringify({ page: 1, per_page: 5, total: 5800, rows: [{ sh_id: 1 }] }), {
          status: 200,
        })
      );
    }) as unknown as typeof fetch;

    const result = await getStationHistory(5);

    expect(capturedUrl).toBe('http://azuracast.test/api/station/aubesonore/history?per_page=5');
    expect(capturedHeaders).toMatchObject({ 'X-API-Key': 'secret-key' });
    expect(result).toEqual([{ sh_id: 1 }]);
  });

  it('asks AzuraCast once for concurrent calls on a cold cache', async () => {
    let calls = 0;
    globalThis.fetch = (() => {
      calls++;
      return Promise.resolve(
        new Response(JSON.stringify({ page: 1, rows: [{ sh_id: calls }] }), { status: 200 })
      );
    }) as unknown as typeof fetch;

    const results = await Promise.all([getStationHistory(5), getStationHistory(5)]);

    expect(calls).toBe(1);
    expect(results).toEqual([[{ sh_id: 1 }], [{ sh_id: 1 }]]);
  });

  it('caches the result per rows value for subsequent calls', async () => {
    let calls = 0;
    globalThis.fetch = (() => {
      calls++;
      return Promise.resolve(
        new Response(JSON.stringify({ page: 1, rows: [{ sh_id: calls }] }), { status: 200 })
      );
    }) as unknown as typeof fetch;

    const first = await getStationHistory(5);
    const second = await getStationHistory(5);

    expect(calls).toBe(1);
    expect(second).toEqual(first);
  });

  it('throws on a non-200 AzuraCast response', async () => {
    globalThis.fetch = (() =>
      Promise.resolve(new Response('nope', { status: 403 }))) as unknown as typeof fetch;

    let err: unknown;
    try {
      await getStationHistory(120);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(Error);
  });

  it('throws when the payload is not the paginated envelope', async () => {
    globalThis.fetch = (() =>
      Promise.resolve(
        new Response(JSON.stringify([{ sh_id: 1 }]), { status: 200 })
      )) as unknown as typeof fetch;

    let err: unknown;
    try {
      await getStationHistory(5);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/unexpected payload shape/);
  });
});
