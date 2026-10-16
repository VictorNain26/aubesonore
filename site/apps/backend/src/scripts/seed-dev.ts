// A local stack's listener, for working on the pages a signed-in listener sees: a verified
// account and a few kept tracks, with and without an album, of three artists the antenna
// played that Musilogy's sample also holds (scripts/musilogy-sample.sh). They keep their
// production ids, slugs and MBIDs, so the public data scripts/pull-public-data.sh copies (their
// plays, their stored profile) and the sample's sections land on the same pages. Run by
// compose.yaml's dev-init; safe to run again.
import { and, eq, like, notInArray } from 'drizzle-orm';
import { auth } from '../lib/auth/index';
import { db } from '../db/index';
import { artist, artistSlug, likedTracks, user as userTable } from '../db/schema';
import { normalizeArtistName } from '../lib/artistName';

const { DEV_USER_EMAIL, DEV_USER_PASSWORD, DEV_USER_NAME } = Bun.env;
if (!DEV_USER_EMAIL || !DEV_USER_PASSWORD) {
  console.error('DEV_USER_EMAIL and DEV_USER_PASSWORD are required (.env.example)');
  process.exit(1);
}

const ARTISTS = [
  {
    id: '6adbf995-4368-4e61-b49a-121ce7f7439f',
    slug: 'david-bowie',
    name: 'David Bowie',
    mbid: '5441c29d-3602-4898-b1a1-b77fa23b8e50',
  },
  {
    id: 'd477fd70-89cb-49c2-8515-df6806022d1b',
    slug: 'buzz-kull',
    name: 'Buzz Kull',
    mbid: 'f38ed14d-07db-4a4b-9270-53435358898a',
  },
  {
    id: '0db30429-8bf5-4b5e-818b-d6ac5dcc71f3',
    slug: 'orange-juice',
    name: 'Orange Juice',
    mbid: 'e598d30e-4ce1-402e-94a7-6f44779da6b7',
  },
] as const;

const KEPT: Array<{ title: string; artist: (typeof ARTISTS)[number]; album: string | null }> = [
  { title: '"Heroes"', artist: ARTISTS[0], album: '“Heroes”' },
  { title: 'Into the Void', artist: ARTISTS[1], album: null },
  { title: 'Tender Object', artist: ARTISTS[2], album: null },
  { title: 'Rip It Up', artist: ARTISTS[2], album: 'Rip It Up' },
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
  // An artist with an MBID has its page named by the MBID (services/artistSlugs.ts).
  await db.insert(artistSlug).values({ slug: one.slug, mbid: one.mbid }).onConflictDoNothing();
}

// A database seeded by an earlier version of this list converges on this one; what the
// listener kept by hand stays.
const keptIds = KEPT.map((_, i) => `dev-kept-${i + 1}`);
await db
  .delete(likedTracks)
  .where(and(like(likedTracks.id, 'dev-kept-%'), notInArray(likedTracks.id, keptIds)));
for (const [i, track] of KEPT.entries()) {
  const kept = {
    title: track.title,
    artist: track.artist.name,
    album: track.album,
    youtubeUrl: `https://www.youtube.com/results?search_query=${encodeURIComponent(`${track.artist.name} ${track.title}`)}`,
    userId: listener.id,
    artistId: track.artist.id,
  };
  await db
    .insert(likedTracks)
    .values({ id: `dev-kept-${i + 1}`, ...kept })
    .onConflictDoUpdate({ target: likedTracks.id, set: kept });
}

console.log(
  `dev listener ${DEV_USER_EMAIL}: ${ARTISTS.length} artists, ${KEPT.length} kept tracks`
);
process.exit(0);
