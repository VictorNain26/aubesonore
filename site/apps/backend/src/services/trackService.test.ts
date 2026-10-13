import { afterAll, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test';
import { createHash } from 'crypto';

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
// even with --isolate, and trackLinksService.test needs the real one.
const trackLinks = await import('./trackLinksService');
const findItunesCoverMock = spyOn(trackLinks, 'findItunesCover').mockResolvedValue(null);
const radioPlays = await import('./radioPlayService');
const findPlayMock = spyOn(radioPlays, 'findPlay').mockResolvedValue(null);
const resolver = await import('./artistResolver');
const resolveArtistMock = spyOn(resolver, 'resolveArtist').mockResolvedValue({
  id: 'artist-1',
  slug: 'artist',
});

const originalFetch = globalThis.fetch;
const fetchMock = mock((): Promise<Response> => Promise.reject(new Error('no network in tests')));
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
  findItunesCoverMock.mockClear();
  fetchMock.mockClear();
});

afterAll(() => {
  findItunesCoverMock.mockRestore();
  findPlayMock.mockRestore();
  resolveArtistMock.mockRestore();
  globalThis.fetch = originalFetch;
});

describe('likeTrack → background enrichment', () => {
  it('swaps the AzuraCast artwork for our own copy when iTunes has no verified cover', async () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
    findItunesCoverMock.mockResolvedValueOnce(null);
    fetchMock.mockResolvedValueOnce(
      new Response(jpeg, { headers: { 'content-type': 'image/jpeg' } })
    );

    await likeTrack({
      user: fakeUser,
      body: {
        title: 'Unknown Song',
        artist: 'Emerging Artist',
        youtubeUrl: 'https://youtube.example.com/watch?v=abc',
        artworkUrl: 'https://radio.aubesonore.fr/api/station/aubesonore/art/abc-1790856695.jpg',
      },
    });
    await flushBackgroundWork();

    const sha256 = createHash('sha256').update(jpeg).digest('hex');
    expect(rows[0]?.artworkUrl).toBe(`http://localhost:3000/api/covers/${sha256}`);
  });

  it('keeps the AzuraCast artwork when neither iTunes nor the copy succeeds', async () => {
    findItunesCoverMock.mockResolvedValueOnce(null);

    await likeTrack({
      user: fakeUser,
      body: {
        title: 'Unknown Song',
        artist: 'Emerging Artist',
        youtubeUrl: 'https://youtube.example.com/watch?v=abc',
        artworkUrl: 'https://azuracast.example.com/art/abc.jpg',
      },
    });
    await flushBackgroundWork();

    expect(rows[0]?.artworkUrl).toBe('https://azuracast.example.com/art/abc.jpg');
  });

  it('uses the verified iTunes artwork directly when there is one', async () => {
    findItunesCoverMock.mockResolvedValueOnce('https://apple-cdn.example.com/art/hd.jpg');

    await likeTrack({
      user: fakeUser,
      body: {
        title: 'Known Song',
        artist: 'Known Artist',
        youtubeUrl: 'https://youtube.example.com/watch?v=def',
        artworkUrl: 'https://azuracast.example.com/art/def.jpg',
      },
    });
    await flushBackgroundWork();

    expect(rows[0]?.artworkUrl).toBe('https://apple-cdn.example.com/art/hd.jpg');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('leaves artwork_url untouched when there is no AzuraCast art and no iTunes cover', async () => {
    findItunesCoverMock.mockResolvedValueOnce(null);

    await likeTrack({
      user: fakeUser,
      body: {
        title: 'Song',
        artist: 'Artist',
        youtubeUrl: 'https://youtube.example.com/watch?v=ghi',
      },
    });
    await flushBackgroundWork();

    expect(rows[0]?.artworkUrl).toBeNull();
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
