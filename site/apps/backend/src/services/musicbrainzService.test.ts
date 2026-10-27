import { describe, it, expect, spyOn, afterEach, beforeEach, jest } from 'bun:test';
// Real MusicBrainz answers (2026-10-02), relations trimmed to the types the service reads.
import group from './__fixtures__/musicbrainz-artist-group.json';
import isrcAnswer from './__fixtures__/musicbrainz-isrc.json';
// A real search answer (2026-10-12), trimmed to the fields the service reads.
import searchAnswer from './__fixtures__/musicbrainz-search-recording.json';

const {
  findRecordingsByIsrc,
  findRecordingsByTitle,
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

describe('findDeezerIdByMbid', () => {
  // Daft Punk's page with a single Deezer link (it declares two, 2026-10-02).
  const single = {
    ...group,
    relations: group.relations.filter(
      (relation) => relation.url.resource !== 'https://www.deezer.com/artist/1477045'
    ),
  };

  it('reads the Deezer artist the page declares when it declares one', async () => {
    const fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValueOnce(json(single));

    expect(await findDeezerIdByMbid(group.id)).toEqual({ status: 'found', value: '27' });
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toContain(`/artist/${group.id}?inc=url-rels`);
    expect(new Headers(init.headers).get('user-agent')).toContain('AubeSonore');
  });

  it('binds none when the page declares two Deezer artists', async () => {
    spyOn(globalThis, 'fetch').mockResolvedValueOnce(json(group));

    expect(await findDeezerIdByMbid(group.id)).toEqual({ status: 'none' });
  });

  it('caches an unknown artist, retries after a failure', async () => {
    const fetchSpy = spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json({ error: 'Not Found' }, 404))
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(json(single));

    expect(await findDeezerIdByMbid('1')).toEqual({ status: 'none' });
    expect(await findDeezerIdByMbid('1')).toEqual({ status: 'none' });
    expect(fetchSpy.mock.calls.length).toBe(1);

    expect(await findDeezerIdByMbid('2')).toEqual({ status: 'failed' });
    expect((await findDeezerIdByMbid('2')).status).toBe('found');
  });

  it('keeps its pace when the system clock is set back', async () => {
    spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json(single))
      .mockResolvedValueOnce(json(single));
    const now = Date.now();
    const wallClock = spyOn(Date, 'now').mockReturnValue(now);
    try {
      expect((await findDeezerIdByMbid('1')).status).toBe('found');
      wallClock.mockReturnValue(now - 5_000);
      expect((await findDeezerIdByMbid('2')).status).toBe('found');
    } finally {
      wallClock.mockRestore();
    }
  });

  it('fails at once rather than queue past the caller budget', async () => {
    jest.useFakeTimers();
    try {
      const fetchSpy = spyOn(globalThis, 'fetch');
      for (let i = 0; i < 4; i++) fetchSpy.mockResolvedValueOnce(json(single));

      // One slot a second: the fifth would wait 4 s, past the 3 s bound.
      const queued = ['1', '2', '3', '4'].map((id) => findDeezerIdByMbid(id));
      expect(await findDeezerIdByMbid('5')).toEqual({ status: 'failed' });

      jest.advanceTimersByTime(3_000);
      const results = await Promise.all(queued);
      expect(results.map((result) => result.status)).toEqual(['found', 'found', 'found', 'found']);
      expect(fetchSpy.mock.calls.length).toBe(4);
    } finally {
      jest.useRealTimers();
    }
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

describe('findRecordingsByTitle', () => {
  it('searches the title and the name as phrases, and reads each recording and its credits', async () => {
    const fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValueOnce(json(searchAnswer));

    const found = await findRecordingsByTitle('Talulah Gosh', 'Talulah Gosh');

    const [url] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(decodeURIComponent(url)).toContain(
      '/recording/?query=recording:"Talulah Gosh" AND artist:"Talulah Gosh"&limit=100'
    );
    if (found.status !== 'found') throw new Error(`expected recordings, got ${found.status}`);
    expect(found.value).toHaveLength(searchAnswer.recordings.length);
    const [first] = searchAnswer.recordings;
    const [credit] = first?.['artist-credit'] ?? [];
    if (!first || !credit) throw new Error('the fixture holds a credited recording');
    expect(found.value[0]).toEqual({
      title: first.title,
      credits: [{ mbid: credit.artist.id, names: ['Talulah Gosh', 'Talulah Gosh'] }],
    });
  });

  it('escapes a quote and a backslash inside the phrases', async () => {
    const fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValueOnce(json({ recordings: [] }));

    await findRecordingsByTitle('A\\B', 'Say "Hi"');

    const [url] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(decodeURIComponent(url)).toContain('recording:"Say \\"Hi\\"" AND artist:"A\\\\B"');
  });
});
