import { describe, it, expect, spyOn, afterEach } from 'bun:test';

const { searchArtist, getArtist, findTrackByIsrc, deezerCache, __resetDeezerCircuit } =
  await import('./deezerService');

const norm = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

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

describe('searchArtist', () => {
  const track = (title: string, id: number, name: string) => ({
    title,
    artist: { id, name, picture_xl: `https://cdn.deezer.com/${id}.jpg` },
  });

  it('binds the artist of the played track, though a homonym ranks first by name', async () => {
    // Real ranking (2026-10-02): a name search for "Cassius" puts a 6-fan rapper first.
    const fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      json({
        data: [
          track('Cassius 1999 (Radio Edit)', 2049, 'Cassius'),
          track('Cassius 1999', 666072, 'Disco Band'),
        ],
      })
    );

    expect(await searchArtist('Cassius', 'Cassius 1999', norm)).toEqual({
      status: 'match',
      artist: { id: '2049', name: 'Cassius', picture: 'https://cdn.deezer.com/2049.jpg' },
    });
    expect(fetchSpy.mock.calls.length).toBe(1);
  });

  it('binds by name an artist without homonym when no track matches', async () => {
    spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json({ data: [track('Another Song', 27, 'Daft Punk')] }))
      .mockResolvedValueOnce(
        json({ data: [{ id: 27, name: 'Daft Punk', picture_xl: 'https://cdn.deezer.com/dp.jpg' }] })
      );

    expect(await searchArtist('daft punk', 'Veridis Quo', norm)).toEqual({
      status: 'match',
      artist: { id: '27', name: 'Daft Punk', picture: 'https://cdn.deezer.com/dp.jpg' },
    });
  });

  it('binds no one among homonyms that the title cannot tell apart', async () => {
    spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json({ data: [] }))
      .mockResolvedValueOnce(
        json({
          data: [
            { id: 67747332, name: 'Cassius', picture_xl: null },
            { id: 2049, name: 'Cassius', picture_xl: null },
          ],
        })
      );

    expect(await searchArtist('Cassius', 'Unknown Title', norm)).toEqual({ status: 'none' });
  });

  it('rejects a name that differs, however close', async () => {
    spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json({ data: [track('Around the World', 99, 'Daft Punks')] }))
      .mockResolvedValueOnce(json({ data: [{ id: 99, name: 'Daft Punks', picture_xl: null }] }));

    expect(await searchArtist('Daft Punk', 'Around the World', norm)).toEqual({ status: 'none' });
  });

  it('reports and caches a miss on an empty result set', async () => {
    const fetchSpy = spyOn(globalThis, 'fetch').mockImplementation((() =>
      Promise.resolve(json({ data: [] }))) as unknown as typeof fetch);

    expect(await searchArtist('No Such Artist Anywhere', 'X', norm)).toEqual({ status: 'none' });
    expect(await searchArtist('No Such Artist Anywhere', 'X', norm)).toEqual({ status: 'none' });
    expect(fetchSpy.mock.calls.length).toBe(2);
  });

  it('reports a 500 as a failure, not a miss, and retries next time', async () => {
    const fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, { status: 500 })
    );

    expect(await searchArtist('Transient Failure Artist', 'X', norm)).toEqual({ status: 'failed' });
    expect(await searchArtist('Transient Failure Artist', 'X', norm)).toEqual({ status: 'failed' });
    expect(fetchSpy.mock.calls.length).toBe(2);
  });

  it('reports a failed name search as a failure, not a miss', async () => {
    spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json({ data: [] }))
      .mockResolvedValueOnce(new Response(null, { status: 500 }));

    expect(await searchArtist('Half Failure Artist', 'X', norm)).toEqual({ status: 'failed' });
  });

  it('reports an error body sent with HTTP 200 as a failure', async () => {
    const fetchSpy = spyOn(globalThis, 'fetch').mockImplementation((() =>
      Promise.resolve(
        json({ error: { type: 'Exception', message: 'Quota limit exceeded', code: 4 } })
      )) as unknown as typeof fetch);

    expect(await searchArtist('Quota Artist', 'X', norm)).toEqual({ status: 'failed' });
    expect(await searchArtist('Quota Artist', 'X', norm)).toEqual({ status: 'failed' });
    expect(fetchSpy.mock.calls.length).toBe(2);
  });

  it('opens the circuit on 429 and stops calling upstream', async () => {
    const fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, { status: 429 })
    );

    expect(await searchArtist('Rate Limited One', 'X', norm)).toEqual({ status: 'failed' });
    const callsAfterFirst = fetchSpy.mock.calls.length;
    expect(await searchArtist('Rate Limited Two', 'X', norm)).toEqual({ status: 'failed' });

    expect(fetchSpy.mock.calls.length).toBe(callsAfterFirst);
  });

  it('coalesces concurrent identical lookups into one upstream call', async () => {
    const fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(
      ((): Promise<Response> =>
        new Promise<Response>((resolve) =>
          setTimeout(() => resolve(json({ data: [track('Sexy Boy', 7, 'Air')] })), 20)
        )) as unknown as typeof fetch
    );

    const [first, second, third] = await Promise.all([
      searchArtist('Air', 'Sexy Boy', norm),
      searchArtist('Air', 'Sexy Boy', norm),
      searchArtist('Air', 'Sexy Boy', norm),
    ]);

    expect(first).toEqual({
      status: 'match',
      artist: { id: '7', name: 'Air', picture: 'https://cdn.deezer.com/7.jpg' },
    });
    expect(second).toEqual(first);
    expect(third).toEqual(first);
    expect(fetchSpy.mock.calls.length).toBe(1);
  });

  it('encodes the artist name and the title into the query string', async () => {
    const fetchSpy = spyOn(globalThis, 'fetch').mockImplementation((() =>
      Promise.resolve(json({ data: [] }))) as unknown as typeof fetch);

    await searchArtist('Simon & Garfunkel', 'The Boxer', norm);

    const [trackUrl, artistUrl] = fetchSpy.mock.calls.map(([url]) => url as string);
    expect(trackUrl).toContain('Simon%20%26%20Garfunkel%20The%20Boxer');
    expect(artistUrl).toContain('/search/artist?limit=10&q=Simon%20%26%20Garfunkel');
  });
});

describe('getArtist', () => {
  it('caches the "no data" answer (code 800) as a definitive miss', async () => {
    const fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValue(
      json({ error: { type: 'DataException', message: 'no data', code: 800 } })
    );

    expect(await getArtist('999999999999')).toEqual({ status: 'none' });
    expect(await getArtist('999999999999')).toEqual({ status: 'none' });
    expect(fetchSpy.mock.calls.length).toBe(1);
  });

  it('retries after any other error body', async () => {
    const fetchSpy = spyOn(globalThis, 'fetch').mockImplementation((() =>
      Promise.resolve(
        json({ error: { type: 'Exception', message: 'Quota limit exceeded', code: 4 } })
      )) as unknown as typeof fetch);

    expect(await getArtist('27')).toEqual({ status: 'failed' });
    expect(await getArtist('27')).toEqual({ status: 'failed' });
    expect(fetchSpy.mock.calls.length).toBe(2);
  });
});

describe('findTrackByIsrc', () => {
  it('returns the track with that ISRC, its artist then its other contributors', async () => {
    // Measured on 2026-10-04, trimmed to the fields read.
    const fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      json({
        id: 17590811,
        title: "Since I Don't Have You (Mono)",
        isrc: 'GBAYE6500165',
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
          { id: '1887', name: 'Manfred Mann', picture: null },
          { id: '99', name: 'Guest', picture: null },
        ],
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
});
