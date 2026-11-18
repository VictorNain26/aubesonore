import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { sql } from 'drizzle-orm';
import { db, pool } from '../db';
import { discoveredArtist } from '../db/schema';
import { assertTestDatabase, emptyArtistTables, installMusilogyRanks, setRanks } from '../test/pg';
import { slugsFor } from './artistSlugs';
import { listDiscoveredPages, loadDiscovered } from './discoveredArtists';

const mbid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

beforeAll(async () => {
  await assertTestDatabase();
  await installMusilogyRanks();
});

beforeEach(async () => {
  await emptyArtistTables();
  await db.execute(sql`TRUNCATE discovered_artist`);
  await setRanks({});
});

afterAll(async () => {
  await db.execute(sql`TRUNCATE discovered_artist`);
  await pool.end();
});

describe('listDiscoveredPages', () => {
  it('gives each discovered page at its slug, else at its MBID: the sitemap publishes them', async () => {
    await db.insert(discoveredArtist).values([{ mbid: mbid(1) }, { mbid: mbid(2) }]);
    await setRanks({ [mbid(1)]: 1 });
    await slugsFor([{ mbid: mbid(1), name: 'Shame' }]);
    await loadDiscovered();

    expect(await listDiscoveredPages()).toEqual([mbid(2), 'shame']);
  });
});
