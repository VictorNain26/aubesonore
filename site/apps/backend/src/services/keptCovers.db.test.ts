import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { sql } from 'drizzle-orm';
import { readFileSync } from 'fs';
import { mkdtemp, readFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { db, pool } from '../db';
import { likedTracks, user } from '../db/schema';
import { assertTestDatabase } from '../test/pg';
import { createCoverStore, type CoverStore } from './coverStore';
import { moveKeptCovers } from './keptCovers';

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);
const BYTES_A = Buffer.from([0xff, 0xd8, 0xff, 1, 2, 3]);
const BYTES_B = Buffer.from([0x89, 0x50, 0x4e, 0x47, 4, 5]);
const DROP = readFileSync(
  join(import.meta.dir, '../../drizzle/0023_drop_covers_moved_to_store.sql'),
  'utf8'
);

let root: string;
let store: CoverStore;

// The table as production holds it before this change (schema.ts no longer declares it).
async function createCoversTable(rows: Array<[string, Buffer]>) {
  await db.execute(sql`DROP TABLE IF EXISTS covers`);
  await db.execute(sql`
    CREATE TABLE covers (
      sha256 text PRIMARY KEY,
      content_type text NOT NULL,
      bytes bytea NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )`);
  for (const [sha, bytes] of rows) {
    await db.execute(
      sql`INSERT INTO covers (sha256, content_type, bytes) VALUES (${sha}, 'image/jpeg', ${bytes})`
    );
  }
}

async function keep(id: string, artworkUrl: string) {
  await db.insert(likedTracks).values({
    id,
    title: `Title ${id}`,
    artist: 'Artist',
    artworkUrl,
    youtubeUrl: 'https://www.youtube.com/results?search_query=x',
    userId: 'u1',
  });
}

const artworkOf = async (id: string) =>
  (
    await db.execute<{ artwork_url: string }>(
      sql`SELECT artwork_url FROM liked_tracks WHERE id = ${id}`
    )
  ).rows[0]?.artwork_url;

const coversLeft = async () =>
  (await db.execute<{ sha256: string }>(sql`SELECT sha256 FROM covers ORDER BY sha256`)).rows.map(
    (row) => row.sha256
  );

beforeAll(async () => {
  await assertTestDatabase();
});

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'kept-covers-'));
  store = createCoverStore({
    root,
    userAgent: 'test',
    azuracastBaseUrl: 'http://azuracast.test',
    stationId: 'aubesonore',
    publicBaseUrl: 'https://aubesonore.fr',
  });
  await db.execute(sql`TRUNCATE liked_tracks, "user" CASCADE`);
  const now = new Date();
  await db
    .insert(user)
    .values({ id: 'u1', name: 'L', email: 'l@example.test', createdAt: now, updatedAt: now });
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
  await db.execute(sql`DROP TABLE IF EXISTS covers`);
});

afterAll(async () => {
  await pool.end();
});

describe('moveKeptCovers', () => {
  it("moves each kept cover's bytes to the store and points its tracks there", async () => {
    await createCoversTable([
      [A, BYTES_A],
      [B, BYTES_B],
    ]);
    await keep('t1', `https://api.aubesonore.fr/api/covers/${A}`);
    await keep('t2', `https://api.aubesonore.fr/api/covers/${B}`);
    await keep('t3', 'https://is1-ssl.mzstatic.com/image/thumb/a/600x600bb.jpg');

    expect(await moveKeptCovers(store)).toEqual({ moved: 2, failed: 0 });

    expect(await readFile(join(root, 'originals', A))).toEqual(BYTES_A);
    expect(await readFile(join(root, 'originals', B))).toEqual(BYTES_B);
    expect(await artworkOf('t1')).toBe(`https://aubesonore.fr/covers/kept/${A}/768.webp`);
    expect(await artworkOf('t2')).toBe(`https://aubesonore.fr/covers/kept/${B}/768.webp`);
    expect(await artworkOf('t3')).toBe('https://is1-ssl.mzstatic.com/image/thumb/a/600x600bb.jpg');
    expect(await coversLeft()).toEqual([]);
  });

  it('can run again: what is moved stays, nothing is done twice', async () => {
    await createCoversTable([[A, BYTES_A]]);
    await keep('t1', `https://api.aubesonore.fr/api/covers/${A}`);

    await moveKeptCovers(store);
    expect(await moveKeptCovers(store)).toEqual({ moved: 0, failed: 0 });

    expect(await readFile(join(root, 'originals', A))).toEqual(BYTES_A);
    expect(await artworkOf('t1')).toBe(`https://aubesonore.fr/covers/kept/${A}/768.webp`);
  });

  it('leaves a row, and its tracks, as they were when its file could not be written', async () => {
    await createCoversTable([
      [A, BYTES_A],
      [B, BYTES_B],
    ]);
    await keep('t1', `https://api.aubesonore.fr/api/covers/${A}`);
    const failing: CoverStore = {
      ...store,
      keepOriginal: (sha, bytes) =>
        sha === A ? Promise.reject(new Error('EACCES')) : store.keepOriginal(sha, bytes),
    };

    expect(await moveKeptCovers(failing)).toEqual({ moved: 1, failed: 1 });

    expect(await coversLeft()).toEqual([A]);
    expect(await artworkOf('t1')).toBe(`https://api.aubesonore.fr/api/covers/${A}`);
  });

  it('does nothing once the table is gone', async () => {
    expect(await moveKeptCovers(store)).toEqual({ moved: 0, failed: 0 });
  });
});

describe('migration 0023', () => {
  it('refuses to drop the table while a cover is still in it', async () => {
    await createCoversTable([[A, BYTES_A]]);

    const refused = await pool.query(DROP).catch((error: unknown) => error);

    expect((refused as Error).message).toMatch(/still holds/);
    expect(await coversLeft()).toEqual([A]);
  });

  it('drops the emptied table, and runs again on a database without it', async () => {
    await createCoversTable([]);

    await pool.query(DROP);
    await pool.query(DROP);

    const { rows } = await db.execute<{ t: string | null }>(
      sql`SELECT to_regclass('public.covers')::text AS t`
    );
    expect(rows[0]?.t).toBeNull();
  });
});
