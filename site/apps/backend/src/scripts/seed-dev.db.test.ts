import { afterAll, beforeAll, expect, it } from 'bun:test';
import { eq, inArray, like, notInArray } from 'drizzle-orm';
import { join } from 'path';
import { db, pool } from '../db';
import { artist, artistSlug, likedTracks, user } from '../db/schema';
import { assertTestDatabase } from '../test/pg';

// dev-init runs the seed at every `pnpm stack`: it must pass again whatever the listener did
// in between, and leave what they kept by hand.
const EMAIL = 'seed-dev@aubesonore.test';
const ORANGE_JUICE = '0db30429-8bf5-4b5e-818b-d6ac5dcc71f3';

async function seed(): Promise<{ code: number; output: string }> {
  const run = Bun.spawn([process.execPath, join(import.meta.dir, 'seed-dev.ts')], {
    // As dev-init has it from .env.example: no mail server behind a workstation.
    env: {
      ...process.env,
      DISABLE_EMAILS: 'true',
      DEV_USER_EMAIL: EMAIL,
      DEV_USER_PASSWORD: 'seed-dev-password',
    },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const output = (await new Response(run.stdout).text()) + (await new Response(run.stderr).text());
  return { code: await run.exited, output };
}

async function keptOf(userId: string) {
  return db
    .select({ id: likedTracks.id, title: likedTracks.title })
    .from(likedTracks)
    .where(eq(likedTracks.userId, userId));
}

// A run signs the listener up (a password hash) in its own process.
const SEED_MS = 60_000;

let listener: string;
let artistsBefore: string[];

beforeAll(async () => {
  await assertTestDatabase();
  artistsBefore = (await db.select({ id: artist.id }).from(artist)).map((row) => row.id);
  const first = await seed();
  expect(first).toMatchObject({ code: 0 });
  const [row] = await db.select({ id: user.id }).from(user).where(eq(user.email, EMAIL));
  listener = row!.id;
}, SEED_MS);

afterAll(async () => {
  await db.delete(user).where(eq(user.email, EMAIL));
  const seeded = await db
    .select({ id: artist.id, mbid: artist.mbid })
    .from(artist)
    .where(artistsBefore.length ? notInArray(artist.id, artistsBefore) : undefined);
  const mbids = seeded.flatMap((row) => (row.mbid ? [row.mbid] : []));
  if (mbids.length) await db.delete(artistSlug).where(inArray(artistSlug.mbid, mbids));
  if (seeded.length)
    await db.delete(artist).where(
      inArray(
        artist.id,
        seeded.map((row) => row.id)
      )
    );
  await pool.end();
});

it(
  'passes again over a track the listener let go and kept again by hand',
  async () => {
    const handKept = (await keptOf(listener)).find((track) => track.title === 'Rip It Up')!;
    await db.delete(likedTracks).where(eq(likedTracks.id, handKept.id));
    await db.insert(likedTracks).values({
      id: 'kept-by-hand',
      title: 'Rip It Up',
      artist: 'Orange Juice',
      youtubeUrl: 'https://www.youtube.com/results?search_query=rip',
      userId: listener,
      artistId: ORANGE_JUICE,
    });

    expect(await seed()).toMatchObject({ code: 0 });

    const kept = await keptOf(listener);
    expect(kept.filter((track) => track.title === 'Rip It Up').map((track) => track.id)).toEqual([
      'kept-by-hand',
    ]);
    expect(kept).toHaveLength(4);
  },
  SEED_MS
);

it(
  'converges a database an earlier list seeded',
  async () => {
    await db.delete(likedTracks).where(like(likedTracks.id, 'dev-kept-%'));
    await db.insert(likedTracks).values(
      ['Kids', 'Time to Pretend', 'Where Is My Mind?', 'Here Comes Your Man', 'Jumper'].map(
        (title, i) => ({
          id: `dev-kept-${i + 1}`,
          title,
          artist: 'Old',
          youtubeUrl: 'https://www.youtube.com/results?search_query=old',
          userId: listener,
        })
      )
    );

    expect(await seed()).toMatchObject({ code: 0 });

    expect((await keptOf(listener)).map((track) => track.title).sort()).toEqual(
      ['"Heroes"', 'Into the Void', 'Rip It Up', 'Tender Object'].sort()
    );
  },
  SEED_MS
);
