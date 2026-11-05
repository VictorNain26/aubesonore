import { afterAll, beforeAll, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { db, pool } from '../db';
import { artist, artistSlug, likedTracks, radioPlay, user, type User } from '../db/schema';
import { artistKey } from '../lib/artistName';
import { assertTestDatabase, emptyArtistTables } from '../test/pg';
import * as keptTrackCovers from './keptTrackCovers';
import * as musicbrainz from './musicbrainzService';
import * as onAir from './nowPlaying';
import * as radioPlays from './radioPlayService';
import * as youtubeLinks from './youtubeLinks';
import { getLikedTracks, likeTrack, linkKeptTrack } from './trackService';

const MBID = '00000000-0000-4000-8000-000000000001';
const listener = { id: 'u1' } as User;

// The boundaries: the cover search (keptTrackCovers, tested on its own), YouTube, MusicBrainz
// and the track on air. The rows, their ties and the unique index are the real database's.
const none = { status: 'none' } as const;
let coverAsked: () => void = () => {};
// What the cover search saw of the kept track when it was asked: its ISRC by then.
let isrcSeenByCover: Array<string | null> = [];
const spies = {
  cover: spyOn(keptTrackCovers, 'coverKeptTrack').mockImplementation(async (trackId) => {
    const [row] = await db.select().from(likedTracks).where(eq(likedTracks.id, trackId));
    isrcSeenByCover.push(row?.isrc ?? null);
    coverAsked();
  }),
  youtube: spyOn(youtubeLinks, 'resolveSong').mockResolvedValue(),
  onAir: spyOn(onAir, 'fetchNowPlaying').mockResolvedValue(null),
  isrc: spyOn(musicbrainz, 'findRecordingsByIsrc').mockResolvedValue(none),
  title: spyOn(musicbrainz, 'findRecordingsByTitle').mockResolvedValue(none),
};

/** Likes a track and waits for what likeTrack does behind its answer, which ends on the cover. */
async function likeAndSettle(body: Parameters<typeof likeTrack>[0]['body']) {
  const asked = new Promise<void>((resolve) => {
    coverAsked = resolve;
  });
  const answer = await likeTrack({ user: listener, body });
  if (answer.track) await asked;
  return answer;
}

async function played(artistName: string, title: string, isrc: string | null) {
  await db.insert(radioPlay).values({
    id: randomUUID(),
    shId: Math.floor(Math.random() * 1e9),
    title,
    artist: artistName,
    artistNormalized: artistKey(artistName),
    isrc,
  });
}

const kept = async (id: string) =>
  (await db.select().from(likedTracks).where(eq(likedTracks.id, id)))[0];

beforeAll(async () => {
  await assertTestDatabase();
});

beforeEach(async () => {
  await db.execute(sql`TRUNCATE liked_tracks, youtube_link, radio_play, "user" CASCADE`);
  await emptyArtistTables();
  const now = new Date();
  await db.insert(user).values({
    id: listener.id,
    name: 'L',
    email: 'l@example.test',
    createdAt: now,
    updatedAt: now,
  });
  isrcSeenByCover = [];
  for (const spy of Object.values(spies)) spy.mockClear();
});

afterAll(async () => {
  for (const spy of Object.values(spies)) spy.mockRestore();
  await pool.end();
});

describe('likeTrack', () => {
  const song = {
    title: 'F Major',
    artist: 'Hania Rani',
    youtubeUrl: 'https://www.youtube.com/results?search_query=f+major',
  };

  it("looks the cover up once the track is tied to its play, and reads that play's ISRC", async () => {
    await played('Hania Rani feat. Dobrawa Czocher', 'F Major', 'DEN271800071');

    const answer = await likeAndSettle(song);

    expect(isrcSeenByCover).toEqual(['DEN271800071']);
    const row = await kept(answer.track!.id);
    expect(row?.artistId).not.toBeNull();
    expect(row?.isrc).toBe('DEN271800071');
  });

  it("stores no ISRC a caller sends: only the play's counts", async () => {
    // An untyped caller: the HTTP body as it came, before any validation.
    const answer = await likeAndSettle({ ...song, isrc: 'DEN271800071' } as typeof song);

    expect(answer.track?.isrc).toBeNull();
    expect((await kept(answer.track!.id))?.isrc).toBeNull();
  });

  it('still looks the cover up when tying the track to its play failed', async () => {
    const findPlay = spyOn(radioPlays, 'findPlay').mockRejectedValueOnce(new Error('db down'));
    try {
      await likeAndSettle(song);
    } finally {
      findPlay.mockRestore();
    }

    expect(spies.cover).toHaveBeenCalledTimes(1);
  });
});

describe('linkKeptTrack', () => {
  it("ties a kept track to its play's artist and ISRC, and no other track", async () => {
    await played('Hania Rani', 'F Major', 'DEN271800071');
    await keep('t1', 'Hania Rani', null);
    await keep('t2', 'Hania Rani', null);

    await linkKeptTrack('t1', 'F Major', 'Hania Rani');

    const [tied] = await db.select().from(artist);
    expect(await kept('t1')).toMatchObject({ artistId: tied?.id, isrc: 'DEN271800071' });
    expect(await kept('t2')).toMatchObject({ artistId: null, isrc: null });
  });

  it('leaves a track the antenna is not known to have played untied, and makes no artist', async () => {
    await keep('t1', 'Typed By Hand', null);

    await linkKeptTrack('t1', 'Anything', 'Typed By Hand');

    expect((await kept('t1'))?.artistId).toBeNull();
    expect(await db.select().from(artist)).toEqual([]);
  });
});

async function keep(id: string, artistName: string, artistId: string | null) {
  await db.insert(likedTracks).values({
    id,
    title: `Title ${id}`,
    artist: artistName,
    youtubeUrl: 'https://www.youtube.com/results?search_query=x',
    userId: listener.id,
    artistId,
  });
}

async function pagesOf() {
  const tracks = await getLikedTracks({ user: listener });
  return Object.fromEntries(tracks.map((track) => [track.id, track.artistPage]));
}

describe('getLikedTracks', () => {
  it("links the page of an artist with an MBID, whose slug is the MBID's", async () => {
    await db
      .insert(artist)
      .values({ id: 'a1', normalizedName: 'air', displayName: 'Air', mbid: MBID });
    await db.insert(artistSlug).values({ slug: 'air', mbid: MBID });
    await keep('t1', 'Air', 'a1');

    expect(await pagesOf()).toEqual({ t1: { slug: 'air', name: 'Air' } });
  });

  it('links the page of an artist without an MBID, by its own slug', async () => {
    await db.insert(artist).values({ id: 'a2', normalizedName: 'kas', displayName: 'Kas' });
    await db.insert(artistSlug).values({ slug: 'kas', artistId: 'a2' });
    await keep('t2', 'Kas', 'a2');

    expect(await pagesOf()).toEqual({ t2: { slug: 'kas', name: 'Kas' } });
  });

  it('prefers the MBID page over an older slug the row kept', async () => {
    await db
      .insert(artist)
      .values({ id: 'a3', normalizedName: 'moby', displayName: 'Moby', mbid: MBID });
    await db.insert(artistSlug).values([
      { slug: 'moby', mbid: MBID },
      { slug: 'moby-old', artistId: 'a3' },
    ]);
    await keep('t3', 'Moby', 'a3');

    expect(await pagesOf()).toEqual({ t3: { slug: 'moby', name: 'Moby' } });
  });

  it('links nothing for an untied track nor for an artist with no page yet', async () => {
    await db.insert(artist).values({ id: 'a4', normalizedName: 'nus', displayName: 'Nus' });
    await keep('t4', 'Nus', 'a4');
    await keep('t5', 'Typed', null);

    expect(await pagesOf()).toEqual({ t4: null, t5: null });
  });
});
