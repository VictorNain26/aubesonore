import { afterAll, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';

import type { LikedTrack, User } from '../db/schema';
import * as realSchema from '../db/schema';

type Row = LikedTrack;

let rows: Row[] = [];

function makeRow(values: Partial<Row>): Row {
  return {
    id: values.id ?? 'track-1',
    title: values.title ?? 'Title',
    artist: values.artist ?? 'Artist',
    album: values.album ?? null,
    artworkUrl: values.artworkUrl ?? null,
    youtubeUrl: values.youtubeUrl ?? 'https://youtube.example.com/watch?v=x',
    isrc: values.isrc ?? null,
    createdAt: values.createdAt ?? new Date(),
    userId: values.userId ?? 'user-1',
    artistId: values.artistId ?? null,
  };
}

function pick<K extends keyof Row>(row: Row, keys: K[]): Pick<Row, K> {
  const result = {} as Pick<Row, K>;
  for (const key of keys) result[key] = row[key];
  return result;
}

// Minimal fake matching only the query shapes trackService.ts actually uses
// (single row per test — `where` clauses are accepted but not evaluated).
const fakeDb = {
  insert: () => ({
    values: (values: Partial<Row>) => ({
      onConflictDoNothing: () => ({
        returning: (): Promise<Row[]> => {
          const row = makeRow(values);
          rows = [row];
          return Promise.resolve([row]);
        },
      }),
    }),
  }),
  select: (projection?: Partial<Record<keyof Row, unknown>>) => ({
    from: () => ({
      where: () => ({
        limit: (n: number): Promise<Array<Partial<Row>>> => {
          const slice = rows.slice(0, n);
          if (!projection) return Promise.resolve(slice);
          const keys = Object.keys(projection) as (keyof Row)[];
          return Promise.resolve(slice.map((row) => pick(row, keys)));
        },
      }),
    }),
  }),
  update: () => ({
    set: (values: Partial<Row>) => ({
      where: (): Promise<void> => {
        rows = rows.map((row) => ({ ...row, ...values }));
        return Promise.resolve();
      },
    }),
  }),
};

void mock.module('../db/index', () => ({ db: fakeDb, schema: realSchema }));

// spyOn, not mock.module: Bun leaks a mocked module into the other test files
// even with --isolate, and keptTrackCovers.test needs the real one.
const keptTrackCovers = await import('./keptTrackCovers');
const coverKeptTrackMock = spyOn(keptTrackCovers, 'coverKeptTrack').mockResolvedValue();
const radioPlays = await import('./radioPlayService');
const findPlayMock = spyOn(radioPlays, 'findPlay').mockResolvedValue(null);
const resolver = await import('./artistResolver');
const resolveArtistMock = spyOn(resolver, 'resolveArtist').mockResolvedValue({
  id: 'artist-1',
  slug: 'artist',
});

const originalFetch = globalThis.fetch;
const fetchMock = mock(
  (_input: unknown): Promise<Response> => Promise.reject(new Error('no network in tests'))
);
globalThis.fetch = fetchMock as unknown as typeof fetch;

const { likeTrack, linkKeptTrack } = await import('./trackService');

const fakeUser: User = {
  id: 'user-1',
  name: 'Test User',
  email: 'test@example.com',
  emailVerified: true,
  image: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

// enrichTrackInBackground is fire-and-forget from likeTrack; flush the
// macrotask queue so its microtask chain (select → findTrackLinks → update)
// has settled before assertions run.
async function flushBackgroundWork(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  rows = [];
  coverKeptTrackMock.mockClear();
  findPlayMock.mockClear();
  fetchMock.mockClear();
});

afterAll(() => {
  coverKeptTrackMock.mockRestore();
  findPlayMock.mockRestore();
  resolveArtistMock.mockRestore();
  globalThis.fetch = originalFetch;
});

describe('likeTrack → its cover', () => {
  it("asks no platform for a cover: the track starts without one, Apple's never stored", async () => {
    // Were Apple asked, it would answer its art: the like must never reach it.
    fetchMock.mockImplementation((input: unknown) =>
      String(input).startsWith('https://itunes.apple.com/')
        ? Promise.resolve(
            Response.json({
              results: [
                {
                  trackViewUrl: 'https://music.apple.com/fr/song/1',
                  trackName: 'Song',
                  artistName: 'Artist',
                  artworkUrl100: 'https://is1-ssl.mzstatic.com/image/thumb/a/100x100bb.jpg',
                },
              ],
            })
          )
        : Promise.reject(new Error('no network in tests'))
    );

    const answer = await likeTrack({
      user: fakeUser,
      body: {
        title: 'Song',
        artist: 'Artist',
        youtubeUrl: 'https://youtube.example.com/watch?v=a',
      },
    });
    await flushBackgroundWork();

    expect(answer.track?.artworkUrl).toBeNull();
    expect(rows[0]?.artworkUrl).toBeNull();
    expect(fetchMock.mock.calls.map(([url]) => String(url))).not.toContainEqual(
      expect.stringContaining('itunes.apple.com')
    );
    fetchMock.mockImplementation(() => Promise.reject(new Error('no network in tests')));
  });

  it('looks the cover up once the track is tied to its play, whose ISRC it reads', async () => {
    findPlayMock.mockResolvedValueOnce({ title: 'F Major', isrc: 'DEN271800071' });

    await likeTrack({
      user: fakeUser,
      body: {
        title: 'F Major',
        artist: 'Hania Rani',
        youtubeUrl: 'https://youtube.example.com/watch?v=b',
      },
    });
    await flushBackgroundWork();

    expect(coverKeptTrackMock.mock.calls).toEqual([[rows[0]!.id]]);
    expect(rows[0]?.isrc).toBe('DEN271800071');
    expect(findPlayMock.mock.invocationCallOrder[0]!).toBeLessThan(
      coverKeptTrackMock.mock.invocationCallOrder[0]!
    );
  });

  it('still looks the cover up when tying the track to its play failed', async () => {
    findPlayMock.mockRejectedValueOnce(new Error('db down'));

    await likeTrack({
      user: fakeUser,
      body: {
        title: 'Song',
        artist: 'Artist',
        youtubeUrl: 'https://youtube.example.com/watch?v=c',
      },
    });
    await flushBackgroundWork();

    expect(coverKeptTrackMock).toHaveBeenCalledTimes(1);
  });
});

describe('linkKeptTrack', () => {
  it("ties a kept track to its play: the play's ISRC and the resolved artist", async () => {
    rows = [makeRow({ id: 'track-1', title: 'F Major', artist: 'Hania Rani' })];
    findPlayMock.mockResolvedValueOnce({ title: 'F Major', isrc: 'DEN271800071' });

    await linkKeptTrack('track-1', 'F Major', 'Hania Rani');

    expect(rows[0]).toMatchObject({ artistId: 'artist-1', isrc: 'DEN271800071' });
  });

  it('leaves a track the antenna is not known to have played untied', async () => {
    rows = [makeRow({ id: 'track-1' })];

    await linkKeptTrack('track-1', 'Anything', 'Typed By Hand');

    expect(rows[0]?.artistId).toBeNull();
    expect(resolveArtistMock).not.toHaveBeenCalledWith('Typed By Hand');
  });
});
