import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { sql } from 'drizzle-orm';
import { readFileSync } from 'fs';
import { join } from 'path';
import { coverArtUrl } from '@aubesonore/shared-types/client';
import { db, pool } from '../db';
import { likedTracks, user } from '../db/schema';
import { assertTestDatabase } from '../test/pg';
import { coverTrack, storedReleaseGroup, tracksWithoutCover } from './keptTrackCovers';

const DROP_APPLE = readFileSync(
  join(import.meta.dir, '../../drizzle/0024_drop_apple_covers.sql'),
  'utf8'
);
const RG = '37b5994e-d560-480d-b013-e84d9a427b2a';
const CAA = coverArtUrl(RG, 500);
const APPLE = 'https://is1-ssl.mzstatic.com/image/thumb/Music/a/600x600bb.jpg';
const KEPT = `https://aubesonore.fr/covers/kept/${'a'.repeat(64)}/768.webp`;

beforeAll(async () => {
  await assertTestDatabase();
});

beforeEach(async () => {
  await db.execute(sql`TRUNCATE liked_tracks, "user" CASCADE`);
  const now = new Date();
  for (const id of ['u1', 'u2', 'u3']) {
    await db
      .insert(user)
      .values({ id, name: id, email: `${id}@example.test`, createdAt: now, updatedAt: now });
  }
});

afterAll(async () => {
  await pool.end();
});

async function keep(
  id: string,
  artworkUrl: string | null,
  { title = 'F Major', artist = 'Hania Rani', userId = 'u1', isrc = null as string | null } = {}
) {
  await db.insert(likedTracks).values({
    id,
    title,
    artist,
    artworkUrl,
    isrc,
    youtubeUrl: 'https://www.youtube.com/results?search_query=x',
    userId,
  });
}

const artworks = async () =>
  Object.fromEntries(
    (
      await db.execute<{ id: string; artwork_url: string | null }>(
        sql`SELECT id, artwork_url FROM liked_tracks ORDER BY id`
      )
    ).rows.map((row) => [row.id, row.artwork_url])
  );

describe('migration 0024', () => {
  it("clears Apple's covers only, keeps every track, and changes nothing run again", async () => {
    await keep('apple', APPLE, { userId: 'u1' });
    await keep('apple2', 'https://is5-ssl.mzstatic.com/image/thumb/b/600x600bb.webp', {
      userId: 'u2',
    });
    await keep('caa', CAA, { userId: 'u3' });
    await keep('kept', KEPT, { title: 'Other' });
    await keep('none', null, { title: 'Third' });

    await db.execute(sql.raw(DROP_APPLE));
    const once = await artworks();
    await db.execute(sql.raw(DROP_APPLE));

    expect(once).toEqual({ apple: null, apple2: null, caa: CAA, kept: KEPT, none: null });
    expect(await artworks()).toEqual(once);
  });
});

describe('the kept tracks without a cover', () => {
  it('are each listed once, whoever kept them, with an ISRC one copy has', async () => {
    await keep('a', null, { userId: 'u1' });
    await keep('b', null, { userId: 'u2', isrc: 'GBVTB2037007' });
    await keep('c', CAA, { title: 'Covered', userId: 'u1' });

    expect(await tracksWithoutCover()).toEqual([
      { title: 'F Major', artist: 'Hania Rani', isrc: 'GBVTB2037007' },
    ]);
  });

  it("take the cover another listener's copy has, and only their own track's", async () => {
    await keep('a', CAA, { userId: 'u1' });
    await keep('b', null, { userId: 'u2' });
    await keep('other', null, { title: 'Other', userId: 'u3' });

    expect(await storedReleaseGroup('F Major', 'Hania Rani')).toBe(RG);
    expect(await storedReleaseGroup('Other', 'Hania Rani')).toBeNull();
    expect(await coverTrack({ title: 'F Major', artist: 'Hania Rani', isrc: null })).toBe('copied');
    expect(await artworks()).toEqual({ a: CAA, b: CAA, other: null });
  });

  it('never take an address that is not the archive’s as the stored cover', async () => {
    await keep('a', KEPT, { userId: 'u1' });

    expect(await storedReleaseGroup('F Major', 'Hania Rani')).toBeNull();
  });
});
