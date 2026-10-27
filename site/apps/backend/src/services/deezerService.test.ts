import { describe, it, expect, spyOn, afterEach } from 'bun:test';

const { findTrackByIsrc, searchTrack, deezerCache, __resetDeezerCircuit } =
  await import('./deezerService');

afterEach(() => {
  spyOn(globalThis, 'fetch').mockRestore?.();
  deezerCache.dispose();
  __resetDeezerCircuit();
});

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
  });
}

describe('findTrackByIsrc', () => {
  it('returns the track with that ISRC, its artist then its other contributors', async () => {
    // Measured on 2026-10-04, trimmed to the fields read.
    const fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      json({
        id: 17590811,
        title: "Since I Don't Have You (Mono)",
        isrc: 'GBAYE6500165',
        link: 'https://www.deezer.com/track/17590811',
        album: {
          cover_medium: 'https://cdn-images.dzcdn.net/images/cover/c1/250x250-000000-80-0-0.jpg',
        },
        artist: { id: 1887, name: 'Manfred Mann', picture_xl: null },
        contributors: [
          { id: 1887, name: 'Manfred Mann', picture_xl: null },
          { id: 99, name: 'Guest', picture_xl: null },
        ],
      })
    );

    expect(await findTrackByIsrc('GBAYE6500165')).toEqual({
      status: 'found',
      value: {
        title: "Since I Don't Have You (Mono)",
        artists: [
          { id: '1887', name: 'Manfred Mann' },
          { id: '99', name: 'Guest' },
        ],
        link: 'https://www.deezer.com/track/17590811',
        cover: 'https://cdn-images.dzcdn.net/images/cover/c1/250x250-000000-80-0-0.jpg',
      },
    });
    const [url] = fetchSpy.mock.calls[0] as [string];
    expect(url).toBe('https://api.deezer.com/track/isrc:GBAYE6500165');
  });

  it('reads "no data" as no track, and a failure as a failure', async () => {
    spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json({ error: { type: 'DataException', code: 800 } }))
      .mockResolvedValueOnce(new Response(null, { status: 503 }));

    expect(await findTrackByIsrc('ZZZ000000000')).toEqual({ status: 'none' });
    expect(await findTrackByIsrc('ZZZ000000001')).toEqual({ status: 'failed' });
  });

  it('reports an error body sent with HTTP 200 as a failure, and retries next time', async () => {
    const fetchSpy = spyOn(globalThis, 'fetch').mockImplementation((() =>
      Promise.resolve(
        json({ error: { type: 'Exception', message: 'Quota limit exceeded', code: 4 } })
      )) as unknown as typeof fetch);

    expect(await findTrackByIsrc('ZZZ000000002')).toEqual({ status: 'failed' });
    expect(await findTrackByIsrc('ZZZ000000002')).toEqual({ status: 'failed' });
    expect(fetchSpy.mock.calls.length).toBe(2);
  });
});

describe('searchTrack', () => {
  it('links the track whose title and artist match, with its ISRC', async () => {
    spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        json({
          data: [
            {
              id: 1,
              title: 'In Flight',
              link: 'https://www.deezer.com/track/1',
              artist: { name: 'Other' },
            },
            {
              id: 2,
              title: 'In Flight',
              link: 'https://www.deezer.com/track/2',
              artist: { name: 'Sunflower Bean' },
            },
          ],
        })
      )
      .mockResolvedValueOnce(json({ isrc: 'USQE92100206' }));

    expect(await searchTrack('In Flight', 'Sunflower Bean')).toEqual({
      status: 'found',
      value: { link: 'https://www.deezer.com/track/2', isrc: 'USQE92100206' },
    });
  });

  it('stays behind the 429 breaker the other lookups open', async () => {
    const fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(null, { status: 429 })
    );
    expect((await findTrackByIsrc('USQE92100206')).status).toBe('failed');

    expect((await searchTrack('In Flight', 'Sunflower Bean')).status).toBe('failed');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
