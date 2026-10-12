import { sql } from 'drizzle-orm';
import { db } from '../db';

/**
 * For the tests against a real Postgres (`*.db.test.ts`, `bun run test:db`): a database whose
 * name ends in `_test`, its schema pushed from schema.ts (`bun run db:push`). Anything else is
 * refused before a table is touched, so a wrong DATABASE_URL never empties a real database.
 */
export async function assertTestDatabase(): Promise<void> {
  const { rows } = await db.execute<{ name: string }>(sql`SELECT current_database() AS name`);
  const name = rows[0]?.name ?? '';
  if (!name.endsWith('_test')) throw new Error(`refusing to run against database "${name}"`);
}

/**
 * Musilogy's rank function, by its contract (musilogy/docs/conception.md §4), answering from a
 * table the test fills: musilogy tests the real one against its data.
 */
export async function installMusilogyRanks(): Promise<void> {
  await db.execute(sql`CREATE SCHEMA IF NOT EXISTS musilogy`);
  await db.execute(
    sql`CREATE TABLE IF NOT EXISTS musilogy.test_rank (mbid text PRIMARY KEY, homonym_rank integer)`
  );
  await db.execute(sql`
    CREATE OR REPLACE FUNCTION musilogy.artist_homonym_rank(artists text[])
    RETURNS TABLE (mbid text, homonym_rank integer)
    LANGUAGE sql STABLE
    AS $$ SELECT t.mbid, t.homonym_rank FROM musilogy.test_rank t WHERE t.mbid = ANY (artists) $$`);
}

/** Each MBID's rank among homonyms, as Musilogy would give it. */
export async function setRanks(ranks: Record<string, number>): Promise<void> {
  await db.execute(sql`TRUNCATE musilogy.test_rank`);
  for (const [mbid, rank] of Object.entries(ranks)) {
    await db.execute(sql`INSERT INTO musilogy.test_rank VALUES (${mbid}, ${rank})`);
  }
}

/** Empties the tables these tests write, between two tests. */
export async function emptyArtistTables(): Promise<void> {
  await db.execute(sql`TRUNCATE artist_slug, artist RESTART IDENTITY CASCADE`);
}
