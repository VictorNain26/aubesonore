import { afterEach, describe, expect, it, spyOn } from 'bun:test';
import { azuracastGet } from './azuracast';

afterEach(() => {
  spyOn(globalThis, 'fetch').mockRestore();
});

describe('azuracastGet', () => {
  it("reads the station's API with its key, a GET and a timeout", async () => {
    const fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: 1 }), { status: 200 })
    );

    expect(await azuracastGet('history?per_page=5', 1_000)).toEqual({ ok: 1 });

    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe('http://azuracast.test/api/station/aubesonore/history?per_page=5');
    expect(init?.headers).toEqual({ 'X-API-Key': 'secret-key' });
    // The site reads the station and never writes to it: no method but GET.
    expect(init?.method).toBeUndefined();
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('throws an error naming the endpoint and the status', async () => {
    spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(null, { status: 503 }));

    const error = await azuracastGet('history?per_page=5', 1_000).then(
      () => null,
      (err: unknown) => err
    );

    expect((error as Error).message).toBe('AzuraCast history error: 503');
  });
});
