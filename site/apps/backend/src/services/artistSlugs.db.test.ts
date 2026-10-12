import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';
import { db, pool } from '../db';
import { artist, artistSlug } from '../db/schema';
import { assertTestDatabase, emptyArtistTables, installMusilogyRanks, setRanks } from '../test/pg';
import { bindArtistSlug, claimSlug, ownerOfSlug, slugOfArtistPage, slugsFor } from './artistSlugs';

const mbid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

beforeAll(async () => {
  await assertTestDatabase();
  await installMusilogyRanks();
});

beforeEach(async () => {
  await emptyArtistTables();
  await setRanks({});
});

afterAll(async () => {
  await pool.end();
});

async function addArtist(id: string, name: string, withMbid: string | null = null) {
  await db.insert(artist).values({
    id,
    normalizedName: name.toLowerCase(),
    displayName: name,
    mbid: withMbid,
  });
}

async function slugsHeld() {
  return db
    .select({ slug: artistSlug.slug, mbid: artistSlug.mbid, artistId: artistSlug.artistId })
    .from(artistSlug)
    .orderBy(artistSlug.slug);
}

describe('a slug given when the address is first published', () => {
  it('names homonyms by their rank, whichever is published first', async () => {
    await setRanks({ [mbid(1)]: 1, [mbid(2)]: 2 });

    expect(await slugsFor([{ mbid: mbid(2), name: 'Nirvana' }])).toEqual(
      new Map([[mbid(2), 'nirvana-2']])
    );
    expect(await slugsFor([{ mbid: mbid(1), name: 'Nirvana' }])).toEqual(
      new Map([[mbid(1), 'nirvana']])
    );
  });

  it('keeps a published slug for good, whatever the rank says later', async () => {
    await setRanks({ [mbid(1)]: 1 });
    await slugsFor([{ mbid: mbid(1), name: 'Air' }]);

    await setRanks({ [mbid(1)]: 2 });
    expect(await slugsFor([{ mbid: mbid(1), name: 'Air' }])).toEqual(new Map([[mbid(1), 'air']]));
  });

  it('leaves at its MBID a page Musilogy cannot rank, writing nothing', async () => {
    expect(await slugsFor([{ mbid: mbid(1), name: 'Air' }])).toEqual(new Map());
    expect(await slugsHeld()).toEqual([]);
  });

  it('names the pages published together once each, in one go', async () => {
    await setRanks({ [mbid(1)]: 1, [mbid(2)]: 1 });

    const slugs = await slugsFor([
      { mbid: mbid(1), name: 'Air' },
      { mbid: mbid(2), name: 'Blur' },
      { mbid: mbid(1), name: 'Air' },
    ]);

    expect(slugs).toEqual(
      new Map([
        [mbid(1), 'air'],
        [mbid(2), 'blur'],
      ])
    );
    expect(await slugsHeld()).toHaveLength(2);
  });

  it('gives a page published twice at once one slug', async () => {
    await setRanks({ [mbid(1)]: 1 });
    const page = { mbid: mbid(1), name: 'Air' };

    const [a, b] = await Promise.all([slugsFor([page]), slugsFor([page])]);

    expect(a.get(mbid(1))).toBe('air');
    expect(b.get(mbid(1))).toBe('air');
    expect(await slugsHeld()).toEqual([{ slug: 'air', mbid: mbid(1), artistId: null }]);
  });

  it('counts past what a batch asks about, a hundred homonyms and more', async () => {
    const held = ['john-smith', ...Array.from({ length: 150 }, (_, i) => `john-smith-${i + 2}`)];
    await db.insert(artistSlug).values(held.map((slug, i) => ({ slug, mbid: mbid(1000 + i) })));
    await setRanks({ [mbid(1)]: 1 });

    expect(await slugsFor([{ mbid: mbid(1), name: 'John Smith' }])).toEqual(
      new Map([[mbid(1), 'john-smith-152']])
    );
  });

  it("hands a played artist's row slug to its MBID's page when that page is first published", async () => {
    // Named on its row while Musilogy could not rank its MBID: the shared address stays.
    await addArtist('a-dp', 'Daft Punk', mbid(5));
    await db.insert(artistSlug).values({ slug: 'daft-punk', artistId: 'a-dp' });
    await setRanks({ [mbid(5)]: 3 });

    expect(await slugsFor([{ mbid: mbid(5), name: 'Daft Punk' }])).toEqual(
      new Map([[mbid(5), 'daft-punk']])
    );
    expect(await slugsHeld()).toEqual([{ slug: 'daft-punk', mbid: mbid(5), artistId: null }]);
  });
});

describe("a played artist's page", () => {
  it('is named by its row while it has no MBID', async () => {
    await addArtist('a-air', 'Air');

    expect(await claimSlug(db, { artistId: 'a-air' }, 'Air')).toBe('air');
    expect(await slugOfArtistPage('a-air')).toBe('air');
    expect(await ownerOfSlug('air')).toEqual({ artistId: 'a-air' });
  });

  it("gives the row's slug to its MBID's page when that page has none", async () => {
    await addArtist('a-air', 'Air');
    await claimSlug(db, { artistId: 'a-air' }, 'Air');
    await db
      .update(artist)
      .set({ mbid: mbid(7) })
      .where(eq(artist.id, 'a-air'));

    await bindArtistSlug(db, 'a-air', mbid(7), 'Air');

    expect(await slugOfArtistPage('a-air')).toBe('air');
    expect(await ownerOfSlug('air')).toEqual({ mbid: mbid(7) });
  });

  it("is its MBID's page, whose slug wins; the row's older slug names it still", async () => {
    await addArtist('a-air', 'Air');
    await claimSlug(db, { artistId: 'a-air' }, 'Air');
    await db.insert(artistSlug).values({ slug: 'air-2', mbid: mbid(7) });
    await db
      .update(artist)
      .set({ mbid: mbid(7) })
      .where(eq(artist.id, 'a-air'));

    await bindArtistSlug(db, 'a-air', mbid(7), 'Air');

    expect(await slugOfArtistPage('a-air')).toBe('air-2');
    // The route answers it with a 301 to air-2.
    expect(await ownerOfSlug('air')).toEqual({ artistId: 'a-air' });
  });
});
