import { describe, it, expect, spyOn, afterEach } from 'bun:test';

const { fetchNowPlaying } = await import('./nowPlaying');

afterEach(() => {
  spyOn(globalThis, 'fetch').mockRestore?.();
});

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
}

describe('fetchNowPlaying', () => {
  it('reads the single object a station endpoint answers', async () => {
    spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      json({
        station: { shortcode: 'aubesonore' },
        now_playing: { sh_id: 4242, song: { title: 'F Major', artist: 'Hania Rani' } },
        song_history: [],
      })
    );

    expect(await fetchNowPlaying()).toEqual({
      sh_id: 4242,
      title: 'F Major',
      artist: 'Hania Rani',
      isrc: null,
      artId: null,
    });
  });

  it("reads the id of the track's art, never a generic image's", async () => {
    const onAir = (art: string) =>
      json({ now_playing: { sh_id: 1, song: { title: 'T', artist: 'A', art } } });
    spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        onAir(
          'https://radio.aubesonore.fr/api/station/aubesonore/art/27d87a8584e8ebe4e670e5e7-1791145643.jpg'
        )
      )
      .mockResolvedValueOnce(onAir('https://radio.aubesonore.fr/static/img/generic_song.jpg'));

    expect((await fetchNowPlaying())?.artId).toBe('27d87a8584e8ebe4e670e5e7-1791145643');
    expect((await fetchNowPlaying())?.artId).toBeNull();
  });

  it('keeps a well-formed ISRC and drops a malformed one', async () => {
    const onAir = (isrc: string) =>
      json({ now_playing: { sh_id: 1, song: { title: 'T', artist: 'A', isrc } } });
    spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(onAir('GBAYE6500165'))
      .mockResolvedValueOnce(onAir(''))
      .mockResolvedValueOnce(onAir('gb-aye-65-00165'));

    expect((await fetchNowPlaying())?.isrc).toBe('GBAYE6500165');
    expect((await fetchNowPlaying())?.isrc).toBeNull();
    expect((await fetchNowPlaying())?.isrc).toBeNull();
  });

  it('returns null when nothing is on air', async () => {
    spyOn(globalThis, 'fetch').mockResolvedValueOnce(json({ station: {}, now_playing: null }));

    expect(await fetchNowPlaying()).toBeNull();
  });

  it('throws on an upstream error so the watcher logs the tick', async () => {
    spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(null, { status: 503 }));

    const error = await fetchNowPlaying().then(
      () => null,
      (err: unknown) => err
    );

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain('503');
  });
});
