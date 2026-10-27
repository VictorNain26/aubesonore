import { afterAll, beforeAll, expect, it } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import { sql } from 'drizzle-orm';
import { db, pool } from '.';
import { likedTracks, radioPlay, user } from './schema';
import { assertTestDatabase } from '../test/pg';

// Migration 0025: a kept track's ISRC counts only when the antenna played that track under it
// (docs/vision.md §4.4); the ones the old catch-up copied from Deezer's API go.
const MIGRATION = readFileSync(
  join(import.meta.dir, '../../drizzle/0025_kept_isrc_from_antenna.sql'),
  'utf8'
);

async function keep(id: string, title: string, artistName: string, isrc: string | null) {
  await db.insert(likedTracks).values({
    id,
    title,
    artist: artistName,
    isrc,
    youtubeUrl: 'https://www.youtube.com/results?search_query=x',
    userId: 'u1',
  });
}

async function play(title: string, artistName: string, isrc: string | null, shId: number) {
  await db.insert(radioPlay).values({
    id: randomUUID(),
    shId,
    title,
    artist: artistName,
    artistNormalized: artistName.toLowerCase(),
    isrc,
  });
}

const isrcs = async () =>
  Object.fromEntries(
    (
      await db.execute<{ id: string; isrc: string | null }>(
        sql`SELECT id, isrc FROM liked_tracks ORDER BY id`
      )
    ).rows.map((row) => [row.id, row.isrc])
  );

beforeAll(async () => {
  await assertTestDatabase();
  await db.execute(sql`TRUNCATE liked_tracks, radio_play, "user" CASCADE`);
  const now = new Date();
  await db
    .insert(user)
    .values({ id: 'u1', name: 'U', email: 'u@example.test', createdAt: now, updatedAt: now });

  await play('Song A', 'Ay', 'FRAAA0000001', 1);
  await play('Song B', 'Bee', 'FRBBB0000001', 2);
  await play('Song C', 'Cee', null, 3);
  await play('Été (Radio Edit)', 'Dee & Eh', 'FRDDD0000001', 4);
  // The antenna's ISRC for this very track.
  await keep('a', 'Song A', 'Ay', 'FRAAA0000001');
  // Another code than the antenna's for the track it played.
  await keep('b', 'Song B', 'Bee', 'USXXX0000001');
  // Played without an ISRC: a code from elsewhere.
  await keep('c', 'Song C', 'Cee', 'USXXX0000002');
  // The antenna's code, but for another of its tracks.
  await keep('d', 'Other song', 'Ay', 'FRAAA0000001');
  // Never played.
  await keep('e', 'Song E', 'E', 'USXXX0000003');
  // The same track, written with other case and spacing.
  await keep('f', 'Été  (radio edit)', 'Dee & Eh', 'FRDDD0000001');
  await keep('g', 'Song G', 'G', null);
});

afterAll(async () => {
  await pool.end();
});

it('keeps only the ISRCs the antenna played the track under, and changes nothing run again', async () => {
  const expected = {
    a: 'FRAAA0000001',
    b: null,
    c: null,
    d: null,
    e: null,
    f: 'FRDDD0000001',
    g: null,
  };
  await db.execute(sql.raw(MIGRATION));
  expect(await isrcs()).toEqual(expected);
  await db.execute(sql.raw(MIGRATION));
  expect(await isrcs()).toEqual(expected);
});
