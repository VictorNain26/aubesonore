import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { sql } from 'drizzle-orm';
import { db, pool } from '../db';
import { artist, artistSlug, likedTracks, user, type User } from '../db/schema';
import { assertTestDatabase, emptyArtistTables } from '../test/pg';
import { getLikedTracks } from './trackService';

const MBID = '00000000-0000-4000-8000-000000000001';
const listener = { id: 'u1' } as User;

beforeAll(async () => {
  await assertTestDatabase();
});

beforeEach(async () => {
  await db.execute(sql`TRUNCATE liked_tracks, youtube_link, "user" CASCADE`);
  await emptyArtistTables();
  const now = new Date();
  await db
    .insert(user)
    .values({
      id: listener.id,
      name: 'L',
      email: 'l@example.test',
      createdAt: now,
      updatedAt: now,
    });
});

afterAll(async () => {
  await pool.end();
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
