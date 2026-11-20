import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { sql } from 'drizzle-orm';
import { db, pool } from '../db';
import { artistSlug } from '../db/schema';
import { assertTestDatabase, emptyArtistTables, installMusilogyRanks, setRanks } from '../test/pg';
import { coreCache, getMusilogyArtist, musilogyCache, searchMusilogy } from './musilogyService';

// Musilogy's card and search as two table-less functions, by their contract
// (musilogy/docs/conception.md §4); the sections it lacks read as not loaded. What the page
// writes, or not, is the real database's.
const BLUR = '00000000-0000-4000-8000-000000000002';

beforeAll(async () => {
  await assertTestDatabase();
  await installMusilogyRanks();
  await db.execute(sql`
    CREATE OR REPLACE FUNCTION musilogy.artist_card(m text)
    RETURNS TABLE (mbid text, name text, disambiguation text, type text, country text,
                   begin_area text, y0 integer, y0_source text, y_end integer,
                   y_end_source text, ended boolean)
    LANGUAGE sql STABLE
    AS $$ SELECT m, 'Blur'::text, NULL::text, 'Group'::text, 'GB'::text, NULL::text, 1988,
               'declared'::text, NULL::integer, NULL::text, false $$`);
  await db.execute(sql`
    CREATE OR REPLACE FUNCTION musilogy.search_artists(q text, n integer)
    RETURNS TABLE (mbid text, name text, disambiguation text, type text, y0 integer)
    LANGUAGE sql STABLE
    AS $$ SELECT '00000000-0000-4000-8000-000000000002'::text, 'Blur'::text, NULL::text, 'Group'::text, 1988 $$`);
});

beforeEach(async () => {
  await emptyArtistTables();
  await setRanks({ [BLUR]: 1 });
  musilogyCache.dispose();
  coreCache.dispose();
});

afterAll(async () => {
  await db.execute(sql`DROP FUNCTION IF EXISTS musilogy.artist_card(text)`);
  await db.execute(sql`DROP FUNCTION IF EXISTS musilogy.search_artists(text, integer)`);
  await pool.end();
});

// A crawler walking Musilogy filled artist_slug with every artist a page named: 1.29 million rows
// by 2026-11-20. Slugs are given to the pages the site publishes; a view reads them.
describe('a view of Musilogy writes nothing', () => {
  it('an artist page links each artist at the address it already has', async () => {
    const page = await getMusilogyArtist(BLUR);

    expect(page?.card.slug ?? null).toBeNull();
    expect(await db.select().from(artistSlug)).toEqual([]);
  });

  it('a search answers each artist at the address it already has', async () => {
    await db.insert(artistSlug).values({ slug: 'blur', mbid: BLUR });

    expect((await searchMusilogy('blur')).map((hit) => hit.slug)).toEqual(['blur']);
    expect(await db.select().from(artistSlug)).toEqual([
      { slug: 'blur', mbid: BLUR, artistId: null },
    ]);

    await emptyArtistTables();
    expect((await searchMusilogy('blur')).map((hit) => hit.slug ?? null)).toEqual([null]);
    expect(await db.select().from(artistSlug)).toEqual([]);
  });
});
