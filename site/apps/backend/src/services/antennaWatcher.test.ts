import { describe, it, expect } from 'bun:test';

import type { WatcherDeps } from './antennaWatcher';
import type { NowPlayingTrack } from './nowPlaying';

const { createAntennaWatcher } = await import('./antennaWatcher');

function track(sh_id: number, artist = 'Hania Rani', title = 'F Major'): NowPlayingTrack {
  return { sh_id, title, artist, isrc: 'DEN271800071', artId: `a${sh_id}-1` };
}

interface RecordedPlay {
  shId: number;
  title: string;
  artist: string;
  isrc: string | null;
}

function makeDeps(overrides: Partial<WatcherDeps> = {}) {
  const played: RecordedPlay[] = [];
  const resolved: string[] = [];
  const covers: string[] = [];
  const deps: WatcherDeps = {
    fetchNowPlaying: () => Promise.resolve(track(1)),
    recordPlay: (shId, title, artist, isrc) => {
      played.push({ shId, title, artist, isrc });
      return Promise.resolve();
    },
    resolveArtist: (artist) => {
      resolved.push(artist);
      return Promise.resolve({ id: `id:${artist}` });
    },
    prepareCover: (artId) => {
      covers.push(artId);
      return Promise.resolve();
    },
    ...overrides,
  };
  return { deps, played, resolved, covers };
}

describe('createAntennaWatcher', () => {
  it('records each new track and identifies its artist, once per sh_id', async () => {
    let current = track(1);
    const { deps, played, resolved } = makeDeps({
      fetchNowPlaying: () => Promise.resolve(current),
    });
    const check = createAntennaWatcher(deps);

    await check();
    await check();
    current = track(2, 'Nils Frahm', 'Says');
    await check();

    expect(played).toEqual([
      { shId: 1, title: 'F Major', artist: 'Hania Rani', isrc: 'DEN271800071' },
      { shId: 2, title: 'Says', artist: 'Nils Frahm', isrc: 'DEN271800071' },
    ]);
    expect(resolved).toEqual(['Hania Rani', 'Nils Frahm']);
  });

  it('records the play before resolving, so the resolver sees its ISRC', async () => {
    const order: string[] = [];
    const { deps } = makeDeps({
      recordPlay: () => {
        order.push('record');
        return Promise.resolve();
      },
      resolveArtist: () => {
        order.push('resolve');
        return Promise.resolve(null);
      },
    });

    await createAntennaWatcher(deps)();

    expect(order).toEqual(['record', 'resolve']);
  });

  it('still identifies the artist when recording the play fails', async () => {
    const { deps, resolved } = makeDeps({
      recordPlay: () => Promise.reject(new Error('db down')),
    });

    await createAntennaWatcher(deps)();

    expect(resolved).toEqual(['Hania Rani']);
  });

  it('survives a failing resolver, the play recorded', async () => {
    const { deps, played } = makeDeps({
      resolveArtist: () => Promise.reject(new Error('musicbrainz down')),
    });

    await createAntennaWatcher(deps)();

    expect(played).toHaveLength(1);
  });

  it('does nothing when nowplaying is null', async () => {
    const { deps, played, resolved } = makeDeps({
      fetchNowPlaying: () => Promise.resolve(null),
    });

    await createAntennaWatcher(deps)();

    expect(played).toHaveLength(0);
    expect(resolved).toHaveLength(0);
  });

  it('does nothing when the artist is blank', async () => {
    const { deps, played, resolved } = makeDeps({
      fetchNowPlaying: () => Promise.resolve(track(1, '   ')),
    });

    await createAntennaWatcher(deps)();

    expect(played).toHaveLength(0);
    expect(resolved).toHaveLength(0);
  });

  it("makes each new track's covers before a listener asks for them", async () => {
    let current = track(1);
    const { deps, covers } = makeDeps({ fetchNowPlaying: () => Promise.resolve(current) });
    const check = createAntennaWatcher(deps);

    await check();
    await check();
    current = { ...track(2), artId: null };
    await check();
    current = track(3, '   ');
    await check();

    expect(covers).toEqual(['a1-1', 'a3-1']);
  });

  it('records the play when its covers cannot be made', async () => {
    const { deps, played } = makeDeps({
      prepareCover: () => Promise.reject(new Error('azuracast down')),
    });

    await createAntennaWatcher(deps)();

    expect(played).toHaveLength(1);
  });
});
