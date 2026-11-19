import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { db, pool } from '../db';
import { artist, artistSlug } from '../db/schema';
import { assertTestDatabase, emptyArtistTables } from '../test/pg';
import { listArtistSlugs, listPlayedMbids } from './artistPages';

beforeAll(async () => {
  await assertTestDatabase();
});

beforeEach(async () => {
  await emptyArtistTables();
  // Out of alphabetical order: the sitemap's order is the query's.
  await db.insert(artist).values([
    // Not identified: its page is its row's.
    { id: 'a-2', normalizedName: 'talulah gosh', displayName: 'Talulah Gosh' },
    // Identified, its MBID page at a slug, and an older slug of its own row.
    { id: 'a-1', normalizedName: 'hania rani', displayName: 'Hania Rani', mbid: 'mb-hania' },
    // Identified, its MBID's page not published yet: no address.
    { id: 'a-3', normalizedName: 'air', displayName: 'Air', mbid: 'mb-air' },
  ]);
  await db.insert(artistSlug).values([
    { slug: 'hania-rani', mbid: 'mb-hania' },
    { slug: 'hania-rani-old', artistId: 'a-1' },
    { slug: 'talulah-gosh', artistId: 'a-2' },
  ]);
});

afterAll(async () => {
  await emptyArtistTables();
  await pool.end();
});

describe('listPlayedMbids', () => {
  it("gives the played artists' MBIDs, the pages Musilogy's links start from", async () => {
    expect((await listPlayedMbids()).sort()).toEqual(['mb-air', 'mb-hania']);
  });
});

describe('listArtistSlugs', () => {
  it("gives each played artist's page once, at its MBID page's slug first, in order", async () => {
    expect(await listArtistSlugs()).toEqual(['hania-rani', 'talulah-gosh']);
  });
});
