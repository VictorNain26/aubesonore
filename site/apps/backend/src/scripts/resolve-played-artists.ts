import { count, isNotNull } from 'drizzle-orm';
import { db, pool } from '../db/index';
import { artist, radioPlay } from '../db/schema';
import { resolveArtist } from '../services/artistResolver';

// One-off catch-up: gives every artist the antenna already played its
// identity, MBID included (docs/vision.md §4.4); new plays are resolved by the
// watcher. Sequential on purpose: MusicBrainz allows one request per second.
const played = await db.selectDistinct({ name: radioPlay.artist }).from(radioPlay);
let failed = 0;
for (const { name } of played) {
  try {
    await resolveArtist(name);
  } catch (err) {
    failed += 1;
    console.error(`${name}: ${(err as Error).message}`);
  }
}
const [known] = await db.select({ n: count() }).from(artist);
const [bridged] = await db.select({ n: count() }).from(artist).where(isNotNull(artist.mbid));
console.log(
  `${played.length} played names, ${failed} failed; ${known?.n ?? 0} artists, ${bridged?.n ?? 0} with an MBID`
);
await pool.end();
