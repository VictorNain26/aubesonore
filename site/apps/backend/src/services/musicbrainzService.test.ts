import { describe, it, expect, spyOn, afterEach, beforeEach, jest } from 'bun:test';
// Real MusicBrainz answers (2026-10-02), relations trimmed to the types the service reads.
import group from './__fixtures__/musicbrainz-artist-group.json';
import deezerUrl from './__fixtures__/musicbrainz-url-deezer.json';
import isrcAnswer from './__fixtures__/musicbrainz-isrc.json';

const {
  findMbidByDeezerId,
  findRecordingsByIsrc,
  findDeezerIdByMbid,
  musicbrainzCache,
  __resetMusicbrainzThrottle,
} = await import('./musicbrainzService');

beforeEach(() => {
  __resetMusicbrainzThrottle();
});

afterEach(() => {
  spyOn(globalThis, 'fetch').mockRestore?.();
  musicbrainzCache.dispose();
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('findMbidByDeezerId', () => {
  it('returns the artist whose page declares the Deezer link', async () => {
    const fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValueOnce(json(deezerUrl));

    expect(await findMbidByDeezerId('27')).toEqual({
      status: 'found',
      value: '056e4f3e-d505-4dad-8ec1-d04f521cbb56',
    });
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toContain(encodeURIComponent('https://www.deezer.com/artist/27'));
    expect(new Headers(init.headers).get('user-agent')).toContain('AubeSonore');
  });

  it('binds no artist when two of them share the Deezer page', async () => {
    const [relation] = deezerUrl.relations;
    spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      json({
        ...deezerUrl,
        relations: [relation, { ...relation, artist: { ...relation?.artist, id: 'other' } }],
      })
    );

    expect(await findMbidByDeezerId('27')).toEqual({ status: 'none' });
  });

  it('caches an unknown link, retries after a failure', async () => {
    const fetchSpy = spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json({ error: 'Not Found' }, 404))
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(json(deezerUrl));

    expect(await findMbidByDeezerId('1')).toEqual({ status: 'none' });
    expect(await findMbidByDeezerId('1')).toEqual({ status: 'none' });
    expect(fetchSpy.mock.calls.length).toBe(1);

    expect(await findMbidByDeezerId('2')).toEqual({ status: 'failed' });
    expect((await findMbidByDeezerId('2')).status).toBe('found');
  });

  it('fails at once rather than queue past the caller budget', async () => {
    jest.useFakeTimers();
    try {
      const fetchSpy = spyOn(globalThis, 'fetch');
      for (let i = 0; i < 4; i++) fetchSpy.mockResolvedValueOnce(json(deezerUrl));

      // One slot a second: the fifth would wait 4 s, past the 3 s bound.
      const queued = ['1', '2', '3', '4'].map((id) => findMbidByDeezerId(id));
      expect(await findMbidByDeezerId('5')).toEqual({ status: 'failed' });

      jest.advanceTimersByTime(3_000);
      const results = await Promise.all(queued);
      expect(results.map((result) => result.status)).toEqual(['found', 'found', 'found', 'found']);
      expect(fetchSpy.mock.calls.length).toBe(4);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('findDeezerIdByMbid', () => {
  it('reads the Deezer artist the page declares when it declares one', async () => {
    const fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      json({
        ...group,
        relations: group.relations.filter(
          (relation) => relation.url.resource !== 'https://www.deezer.com/artist/1477045'
        ),
      })
    );

    expect(await findDeezerIdByMbid(group.id)).toEqual({ status: 'found', value: '27' });
    expect(fetchSpy.mock.calls[0]?.[0]).toContain(`/artist/${group.id}?inc=url-rels`);
  });

  it('binds none when the page declares two Deezer artists', async () => {
    // Daft Punk's page links 27 and 1477045 (2026-10-02).
    spyOn(globalThis, 'fetch').mockResolvedValueOnce(json(group));

    expect(await findDeezerIdByMbid(group.id)).toEqual({ status: 'none' });
  });
});

describe('findRecordingsByIsrc', () => {
  it('returns each recording with every artist credited on it', async () => {
    const fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValueOnce(json(isrcAnswer));

    expect(await findRecordingsByIsrc('GBAYE6500165')).toEqual({
      status: 'found',
      value: [
        {
          title: 'Since I Don’t Have You',
          credits: [
            {
              mbid: '06b6f280-8787-4a3d-8ab6-c6487b465320',
              names: ['Manfred Mann', 'Manfred Mann'],
            },
          ],
        },
      ],
    });
    const [url] = fetchSpy.mock.calls[0] as [string];
    expect(url).toBe('https://musicbrainz.org/ws/2/isrc/GBAYE6500165?inc=artist-credits&fmt=json');
  });

  it('reads an unknown ISRC as a definitive miss', async () => {
    spyOn(globalThis, 'fetch').mockResolvedValueOnce(json({ error: 'Not Found' }, 404));

    expect(await findRecordingsByIsrc('ZZZ000000000')).toEqual({ status: 'none' });
  });
});
