import { describe, it, expect, spyOn, afterEach, beforeEach, jest } from 'bun:test';
// Real MusicBrainz answers (2026-10-02), relations trimmed to the types the service reads.
import group from './__fixtures__/musicbrainz-artist-group.json';
import person from './__fixtures__/musicbrainz-artist-person.json';
import deezerUrl from './__fixtures__/musicbrainz-url-deezer.json';
import isrcAnswer from './__fixtures__/musicbrainz-isrc.json';

const {
  findMbidByDeezerId,
  findMbidByIsrc,
  getArtistByMbid,
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

describe('getArtistByMbid', () => {
  it('reads a group: where and when it formed, one link per platform, https only, site last', async () => {
    spyOn(globalThis, 'fetch').mockResolvedValueOnce(json(group));

    expect(await getArtistByMbid(group.id)).toEqual({
      status: 'found',
      value: {
        facts: {
          kind: 'group',
          place: 'Paris',
          country: 'FR',
          formed: 1993,
          ended: 2021,
          active: false,
        },
        links: [
          { platform: 'spotify', url: 'https://open.spotify.com/artist/4tZwfgrHOc3mvqYlEYSvVi' },
          { platform: 'appleMusic', url: 'https://music.apple.com/fr/artist/5468295' },
          { platform: 'soundcloud', url: 'https://soundcloud.com/daftpunkofficialmusic' },
          { platform: 'official', url: 'https://daftpunk.com/' },
        ],
        wikidataId: 'Q185828',
        // The page declares two Deezer artists (27 and 1477045): neither for sure.
        deezerId: null,
      },
    });
  });

  it('reads the Deezer artist the page declares when it declares one', async () => {
    spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      json({
        ...group,
        relations: group.relations.filter(
          (relation) => relation.url.resource !== 'https://www.deezer.com/artist/1477045'
        ),
      })
    );

    const found = await getArtistByMbid(group.id);

    expect(found.status === 'found' && found.value.deezerId).toBe('27');
  });

  it('skips a former address and lists an address once', async () => {
    const official = (url: string, ended: boolean) => ({
      type: 'official homepage',
      ended,
      url: { resource: url },
    });
    spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      json({
        ...group,
        relations: [
          official('https://old-domain.example/', true),
          official('https://daftpunk.bandcamp.com/', false),
          { type: 'bandcamp', ended: false, url: { resource: 'https://daftpunk.bandcamp.com/' } },
        ],
      })
    );

    const found = await getArtistByMbid(group.id);

    expect(found.status === 'found' && found.value.links).toEqual([
      { platform: 'bandcamp', url: 'https://daftpunk.bandcamp.com/' },
    ]);
  });

  it('reads no career for an artist without a type, who may be a person', async () => {
    spyOn(globalThis, 'fetch').mockResolvedValueOnce(json({ ...group, type: null }));

    const found = await getArtistByMbid(group.id);

    expect(found.status === 'found' && found.value.facts).toEqual({
      kind: null,
      place: null,
      country: 'FR',
      formed: null,
      ended: null,
      active: false,
    });
  });

  it('names no country for a dissolved one or a MusicBrainz region', async () => {
    const soviet = {
      name: 'Soviet Union',
      'iso-3166-1-codes': ['SU'],
      'iso-3166-3-codes': ['SUHH'],
    };
    const worldwide = { name: 'Worldwide', 'iso-3166-1-codes': ['XW'] };
    spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json({ ...group, area: soviet, 'begin-area': soviet }))
      .mockResolvedValueOnce(json({ ...group, id: 'other', area: worldwide }));

    const dissolved = await getArtistByMbid(group.id);
    const region = await getArtistByMbid('other');

    expect(dissolved.status === 'found' && dissolved.value.facts.country).toBeNull();
    expect(dissolved.status === 'found' && dissolved.value.facts.place).toBeNull();
    expect(region.status === 'found' && region.value.facts).toMatchObject({
      place: 'Paris',
      country: null,
    });
  });

  it('never reads a birth as a career for a person', async () => {
    spyOn(globalThis, 'fetch').mockResolvedValueOnce(json(person));

    const found = await getArtistByMbid(person.id);

    expect(found.status === 'found' && found.value.facts).toEqual({
      kind: 'person',
      place: null,
      country: 'GB',
      formed: null,
      ended: null,
      active: false,
    });
  });
});

describe('findMbidByIsrc', () => {
  it('returns the artist credited first on the recording', async () => {
    const fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValueOnce(json(isrcAnswer));

    expect(await findMbidByIsrc('GBAYE6500165')).toEqual({
      status: 'found',
      value: '06b6f280-8787-4a3d-8ab6-c6487b465320',
    });
    const [url] = fetchSpy.mock.calls[0] as [string];
    expect(url).toBe('https://musicbrainz.org/ws/2/isrc/GBAYE6500165?inc=artist-credits&fmt=json');
  });

  it('binds none when the recordings disagree on their artist', async () => {
    const [recording] = isrcAnswer.recordings;
    if (!recording) throw new Error('fixture without recording');
    const other = {
      ...recording,
      'artist-credit': [{ name: 'X', joinphrase: '', artist: { id: 'other', name: 'X' } }],
    };
    spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      json({ ...isrcAnswer, recordings: [recording, other] })
    );

    expect(await findMbidByIsrc('GBAYE6500165')).toEqual({ status: 'none' });
  });

  it('reads an unknown ISRC as a definitive miss', async () => {
    spyOn(globalThis, 'fetch').mockResolvedValueOnce(json({ error: 'Not Found' }, 404));

    expect(await findMbidByIsrc('ZZZ000000000')).toEqual({ status: 'none' });
  });
});
