import { describe, it, expect } from 'bun:test';

import type { WatcherDeps } from './likedArtistWatcher';
import type { NowPlayingTrack } from './nowPlaying';

const { createLikedArtistNotifier } = await import('./likedArtistWatcher');

const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;

function track(sh_id: number, artist = 'Hania Rani', title = 'F Major'): NowPlayingTrack {
  return { sh_id, title, artist, isrc: 'DEN271800071' };
}

interface SentCall {
  userIds: string[];
  title: string;
  body: string;
  url: string;
}

interface RecordedPlay {
  shId: number;
  title: string;
  artist: string;
  isrc: string | null;
}

function makeDeps(overrides: Partial<WatcherDeps> = {}) {
  const sent: SentCall[] = [];
  const played: RecordedPlay[] = [];
  const resolved: string[] = [];
  let currentTime = 1_000_000;
  const deps: WatcherDeps = {
    fetchNowPlaying: () => Promise.resolve(track(1)),
    findUserIdsByArtist: () => Promise.resolve(['user-1']),
    send: (userIds, title, body, url) => {
      sent.push({ userIds, title, body, url });
      return Promise.resolve({ sent: userIds.length, failed: 0 });
    },
    recordPlay: (shId, title, artist, isrc) => {
      played.push({ shId, title, artist, isrc });
      return Promise.resolve();
    },
    resolveArtist: (artist) => {
      resolved.push(artist);
      return Promise.resolve({ id: `id:${artist}` });
    },
    now: () => currentTime,
    ...overrides,
  };
  return { deps, sent, played, resolved, advance: (ms: number) => (currentTime += ms) };
}

describe('createLikedArtistNotifier', () => {
  it('gives each artist the antenna plays its identity, once per new track', async () => {
    const { deps, resolved } = makeDeps();
    const check = createLikedArtistNotifier(deps);

    await check();
    await check();

    expect(resolved).toEqual(['Hania Rani']);
  });

  it('finds who kept the artist by its identity, not its spelling', async () => {
    const asked: string[] = [];
    const { deps } = makeDeps({
      fetchNowPlaying: () => Promise.resolve(track(1, 'Beyonce')),
      resolveArtist: () => Promise.resolve({ id: 'artist-beyonce' }),
      findUserIdsByArtist: (artistId) => {
        asked.push(artistId);
        return Promise.resolve([]);
      },
    });

    await createLikedArtistNotifier(deps)();

    expect(asked).toEqual(['artist-beyonce']);
  });

  it.each([
    ['cannot be identified', () => Promise.resolve(null)],
    ['fails to resolve', () => Promise.reject(new Error('musicbrainz down'))],
  ])('notifies no one when the artist %s, and still records the play', async (_, resolve) => {
    const { deps, sent, played } = makeDeps({ resolveArtist: resolve });

    await createLikedArtistNotifier(deps)();

    expect(sent).toHaveLength(0);
    expect(played).toHaveLength(1);
  });

  it('sends to users who liked the artist when a new track starts', async () => {
    const { deps, sent } = makeDeps();
    const check = createLikedArtistNotifier(deps);

    await check();

    expect(sent).toHaveLength(1);
    expect(sent[0]!.userIds).toEqual(['user-1']);
    expect(sent[0]!.title).toBe('AubeSonore');
    expect(sent[0]!.body).toBe("Hania Rani repasse à l'antenne : « F Major ».");
    expect(sent[0]!.url).toBe('/');
  });

  it('does nothing while the same sh_id stays on air', async () => {
    const { deps, sent } = makeDeps();
    const check = createLikedArtistNotifier(deps);

    await check();
    await check();
    await check();

    expect(sent).toHaveLength(1);
  });

  it('does not re-notify the same user for the same artist within 12h, but does after', async () => {
    let current = track(1);
    const { deps, sent, advance } = makeDeps({
      fetchNowPlaying: () => Promise.resolve(current),
    });
    const check = createLikedArtistNotifier(deps);

    await check();
    advance(TWELVE_HOURS_MS - 1);
    current = track(2);
    await check();
    expect(sent).toHaveLength(1);

    advance(2);
    current = track(3);
    await check();
    expect(sent).toHaveLength(2);
  });

  it('notifies only the likers not already deduped', async () => {
    let likers = ['user-1'];
    let current = track(1);
    const { deps, sent, advance } = makeDeps({
      fetchNowPlaying: () => Promise.resolve(current),
      findUserIdsByArtist: () => Promise.resolve(likers),
    });
    const check = createLikedArtistNotifier(deps);

    await check();
    advance(60_000);
    likers = ['user-1', 'user-2'];
    current = track(2);
    await check();

    expect(sent).toHaveLength(2);
    expect(sent[1]!.userIds).toEqual(['user-2']);
  });

  it('does nothing when nowplaying is null', async () => {
    const { deps, sent } = makeDeps({ fetchNowPlaying: () => Promise.resolve(null) });
    const check = createLikedArtistNotifier(deps);

    await check();

    expect(sent).toHaveLength(0);
  });

  it('does nothing when the artist is blank', async () => {
    const { deps, sent } = makeDeps({
      fetchNowPlaying: () => Promise.resolve(track(1, '   ')),
    });
    const check = createLikedArtistNotifier(deps);

    await check();

    expect(sent).toHaveLength(0);
  });

  it('does nothing when nobody liked the artist', async () => {
    const { deps, sent } = makeDeps({ findUserIdsByArtist: () => Promise.resolve([]) });
    const check = createLikedArtistNotifier(deps);

    await check();

    expect(sent).toHaveLength(0);
  });
});

describe('radio play recording', () => {
  it('records every new track, even when nobody liked the artist', async () => {
    const { deps, played, sent } = makeDeps({ findUserIdsByArtist: () => Promise.resolve([]) });
    const check = createLikedArtistNotifier(deps);

    await check();

    expect(sent).toHaveLength(0);
    expect(played).toEqual([
      { shId: 1, title: 'F Major', artist: 'Hania Rani', isrc: 'DEN271800071' },
    ]);
  });

  it('records once per sh_id, not once per poll', async () => {
    let current = track(1);
    const { deps, played } = makeDeps({ fetchNowPlaying: () => Promise.resolve(current) });
    const check = createLikedArtistNotifier(deps);

    await check();
    await check();
    current = track(2);
    await check();

    expect(played).toHaveLength(2);
  });

  it('does not record a blank artist', async () => {
    const { deps, played } = makeDeps({
      fetchNowPlaying: () => Promise.resolve(track(1, '   ')),
    });
    const check = createLikedArtistNotifier(deps);

    await check();

    expect(played).toHaveLength(0);
  });

  it('keeps notifying when recording the play fails', async () => {
    const { deps, sent } = makeDeps({
      recordPlay: () => Promise.reject(new Error('db down')),
    });
    const check = createLikedArtistNotifier(deps);

    await check();

    expect(sent).toHaveLength(1);
  });
});
