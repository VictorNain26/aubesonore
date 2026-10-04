import { count, eq, isNotNull, isNull } from 'drizzle-orm';
import { env } from '../config/env';
import { db, pool } from '../db/index';
import { artist, radioPlay } from '../db/schema';
import { toIsrc } from '../lib/isrc';
import { normalizeArtistName, primaryArtistName, resolveArtist } from '../services/artistResolver';

// One-off catch-up (docs/vision.md §4.4). Plays recorded before AzuraCast
// reported ISRCs get theirs from the station's media, matched on artist and
// title once normalised; then every played artist is resolved again, which
// identifies new ones and re-identifies those only their name had bound. New
// plays are handled by the watcher. Sequential on purpose: MusicBrainz allows
// one request per second.
const key = (artistName: string, title: string): string =>
  `${normalizeArtistName(primaryArtistName(artistName))}|${normalizeArtistName(title)}`;

const response = await fetch(
  `${env.AZURACAST_BASE_URL}/api/station/${env.AZURACAST_STATION_ID}/files`,
  { headers: { 'X-API-Key': env.AZURACAST_API_KEY }, signal: AbortSignal.timeout(60_000) }
);
if (!response.ok) throw new Error(`AzuraCast files error: ${response.status}`);
const media = (await response.json()) as Array<{
  artist?: unknown;
  title?: unknown;
  isrc?: unknown;
}>;
const isrcs = new Map<string, string>();
for (const file of media) {
  const isrc = toIsrc(file.isrc);
  if (isrc && typeof file.artist === 'string' && typeof file.title === 'string') {
    isrcs.set(key(file.artist, file.title), isrc);
  }
}

const withoutIsrc = await db
  .select({ id: radioPlay.id, artist: radioPlay.artist, title: radioPlay.title })
  .from(radioPlay)
  .where(isNull(radioPlay.isrc));
let filled = 0;
for (const play of withoutIsrc) {
  const isrc = isrcs.get(key(play.artist, play.title));
  if (!isrc) continue;
  await db.update(radioPlay).set({ isrc }).where(eq(radioPlay.id, play.id));
  filled += 1;
}

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
const [byIsrc] = await db
  .select({ n: count() })
  .from(artist)
  .where(eq(artist.identifiedBy, 'isrc'));
const [bridged] = await db.select({ n: count() }).from(artist).where(isNotNull(artist.mbid));
console.log(
  `${filled} of ${withoutIsrc.length} plays given their ISRC; ${played.length} played names, ` +
    `${failed} failed; ${known?.n ?? 0} artists, ${byIsrc?.n ?? 0} identified by ISRC, ` +
    `${bridged?.n ?? 0} with an MBID`
);
await pool.end();
