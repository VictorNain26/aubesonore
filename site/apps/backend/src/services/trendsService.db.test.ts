import { afterAll, beforeAll, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { sql } from 'drizzle-orm';
import { db, pool } from '../db';
import { artist, artistSlug, likedTracks, user } from '../db/schema';
import { assertTestDatabase, emptyArtistTables } from '../test/pg';
import { getTrends, trendsCache } from './trendsService';

const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (days: number) => new Date(Date.now() - days * DAY_MS);

let liked = 0;
async function like(
  listener: string,
  title: string,
  artistName: string,
  at: Date,
  artistId?: string
) {
  liked += 1;
  await db.insert(likedTracks).values({
    id: `t${liked}`,
    userId: listener,
    title,
    artist: artistName,
    youtubeUrl: 'https://www.youtube.com/results?search_query=x',
    createdAt: at,
    artistId: artistId ?? null,
  });
}

beforeAll(async () => {
  await assertTestDatabase();
});

beforeEach(async () => {
  await db.execute(sql`TRUNCATE liked_tracks, "user" CASCADE`);
  await emptyArtistTables();
  const now = new Date();
  await db.insert(user).values(
    ['u1', 'u2', 'u3'].map((id) => ({
      id,
      name: id,
      email: `${id}@example.test`,
      createdAt: now,
      updatedAt: now,
    }))
  );
  trendsCache.dispose();
});

afterAll(async () => {
  await pool.end();
});

describe('getTrends', () => {
  it("ranks the week's kept tracks, most kept first, a tie by the latest kept", async () => {
    await db.insert(artist).values({ id: 'a-air', normalizedName: 'air', displayName: 'Air' });
    await db.insert(artistSlug).values({ slug: 'air', artistId: 'a-air' });
    await like('u1', 'Twice', 'Air', daysAgo(1), 'a-air');
    await like('u2', 'Twice', 'Air', daysAgo(6), 'a-air');
    // Kept twice, once before the week: it counts once.
    await like('u1', 'Older', 'Blur', daysAgo(2));
    await like('u2', 'Older', 'Blur', daysAgo(8));
    await like('u3', 'Latest', 'Cure', daysAgo(0.5));
    // Kept only before the week.
    await like('u3', 'Gone', 'Dido', daysAgo(8));

    const { week } = await getTrends();

    expect(week.map(({ title, likes }) => [title, likes])).toEqual([
      ['Twice', 2],
      ['Latest', 1],
      ['Older', 1],
    ]);
    expect(week[0]?.artistPage).toEqual({ slug: 'air', name: 'Air' });
    expect(week[1]?.artistPage).toBeNull();
  });

  it('serves the ranking it computed for five minutes, then computes it again', async () => {
    const start = Date.now();
    const clock = spyOn(Date, 'now').mockReturnValue(start);
    try {
      await like('u1', 'First', 'Air', daysAgo(1));
      const first = await getTrends();
      await like('u2', 'Second', 'Air', daysAgo(0.5));

      clock.mockReturnValue(start + 5 * 60_000);
      expect(await getTrends()).toEqual(first);
      clock.mockReturnValue(start + 5 * 60_000 + 1);
      expect((await getTrends()).week.map(({ title }) => title)).toEqual(['Second', 'First']);
    } finally {
      clock.mockRestore();
    }
  });

  it('computes one ranking for concurrent calls on a cold cache', async () => {
    await like('u1', 'First', 'Air', daysAgo(1));

    const [a, b, c] = await Promise.all([getTrends(), getTrends(), getTrends()]);

    expect(b).toBe(a);
    expect(c).toBe(a);
  });
});
