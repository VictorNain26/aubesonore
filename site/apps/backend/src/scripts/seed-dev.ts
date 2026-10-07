// A local stack's listener, for working on the pages a signed-in listener sees: a verified
// account, three artists the antenna played (under their production ids, so the artist pages
// relayed from production find what this listener kept of them) and a few kept tracks, with
// and without an album. Run by compose.yaml's dev-init; safe to run again.
import { eq } from 'drizzle-orm';
import { auth } from '../lib/auth/index';
import { db } from '../db/index';
import { artist, artistSlug, likedTracks, user as userTable } from '../db/schema';
import { normalizeArtistName } from '../services/artistResolver';

const { DEV_USER_EMAIL, DEV_USER_PASSWORD, DEV_USER_NAME } = Bun.env;
if (!DEV_USER_EMAIL || !DEV_USER_PASSWORD) {
  console.error('DEV_USER_EMAIL and DEV_USER_PASSWORD are required (.env.example)');
  process.exit(1);
}

const ARTISTS = [
  {
    id: 'b26e14d2-745e-4309-a847-f8a916d91d16',
    slug: 'mgmt',
    name: 'MGMT',
    mbid: 'c485632c-b784-4ee9-8ea1-c5fb365681fc',
  },
  {
    id: '3d7f31e3-2872-4999-81f5-fe5a09d33bca',
    slug: 'pixies',
    name: 'Pixies',
    mbid: 'b6b2bb8d-54a9-491f-9607-7b546023b433',
  },
  {
    id: '461ab030-519d-44ee-a4f1-d52ff23b2543',
    slug: 'boogie-beasts',
    name: 'Boogie Beasts',
    mbid: 'd129a408-d747-4f31-9f8b-1da73d84375d',
  },
] as const;

const KEPT: Array<{ title: string; artist: (typeof ARTISTS)[number]; album: string | null }> = [
  { title: 'Kids', artist: ARTISTS[0], album: 'Oracular Spectacular' },
  { title: 'Time to Pretend', artist: ARTISTS[0], album: 'Oracular Spectacular' },
  { title: 'Where Is My Mind?', artist: ARTISTS[1], album: 'Surfer Rosa' },
  { title: 'Here Comes Your Man', artist: ARTISTS[1], album: 'Doolittle' },
  { title: 'Jumper On The Line', artist: ARTISTS[2], album: null },
];

const email = DEV_USER_EMAIL.toLowerCase();
const known = await db
  .select({ id: userTable.id })
  .from(userTable)
  .where(eq(userTable.email, email));
if (known.length === 0) {
  await auth.api.signUpEmail({
    body: { email, password: DEV_USER_PASSWORD, name: DEV_USER_NAME ?? 'Dev' },
  });
}

const [listener] = await db
  .update(userTable)
  .set({ emailVerified: true })
  .where(eq(userTable.email, email))
  .returning({ id: userTable.id });
if (!listener) throw new Error(`no user ${DEV_USER_EMAIL} after sign-up`);

for (const one of ARTISTS) {
  await db
    .insert(artist)
    .values({
      id: one.id,
      normalizedName: normalizeArtistName(one.name),
      displayName: one.name,
      mbid: one.mbid,
    })
    .onConflictDoNothing();
  await db.insert(artistSlug).values({ slug: one.slug, artistId: one.id }).onConflictDoNothing();
}

for (const [i, track] of KEPT.entries()) {
  await db
    .insert(likedTracks)
    .values({
      id: `dev-kept-${i + 1}`,
      title: track.title,
      artist: track.artist.name,
      album: track.album,
      youtubeUrl: `https://www.youtube.com/results?search_query=${encodeURIComponent(`${track.artist.name} ${track.title}`)}`,
      userId: listener.id,
      artistId: track.artist.id,
    })
    .onConflictDoNothing();
}

console.log(
  `dev listener ${DEV_USER_EMAIL}: ${ARTISTS.length} artists, ${KEPT.length} kept tracks`
);
process.exit(0);
