import { count, eq, isNotNull, isNull } from 'drizzle-orm';
import { env } from '../config/env';
import { db, pool } from '../db/index';
import { artist, likedTracks, radioPlay } from '../db/schema';
import { toIsrc } from '../lib/isrc';
import {
  normalizeArtistName,
  primaryArtistName,
  resolveArtist,
  resolveKeptArtist,
  reverifyArtist,
} from '../services/artistResolver';
import { findPlay } from '../services/radioPlayService';
import { searchDeezer } from '../services/trackLinksService';

// One-off catch-up (docs/vision.md §4.4). Plays recorded before AzuraCast
// reported ISRCs get theirs from the station's media, matched on artist and
// title once normalised; then every played artist is resolved again, which
// identifies new ones and re-identifies those only their name had bound.
// Last, each kept track not yet tied to its artist is tied through its play,
// or, kept before plays were recorded, through its exact Deezer match (title
// and artist), whose ISRC stands for the play. New plays and new kept tracks
// are handled as they come. Sequential on purpose: MusicBrainz allows one
// request per second.
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

// Every known artist identified again from scratch: an identity taken from an
// ISRC before answers were checked against the played title and name is
// replaced, and its stored profile dropped.
const known = await db
  .select({ normalizedName: artist.normalizedName, displayName: artist.displayName })
  .from(artist);
const outcomes = { changed: 0, kept: 0, unplayed: 0, failed: 0 };
for (const row of known) {
  try {
    const outcome = await reverifyArtist(row.normalizedName, row.displayName);
    outcomes[outcome] += 1;
    if (outcome === 'changed') console.log(`identity changed: ${row.displayName}`);
  } catch (err) {
    outcomes.failed += 1;
    console.error(`${row.displayName}: ${(err as Error).message}`);
  }
}

const untied = await db
  .select({ id: likedTracks.id, title: likedTracks.title, artist: likedTracks.artist })
  .from(likedTracks)
  .where(isNull(likedTracks.artistId));
let tied = 0;
for (const kept of untied) {
  try {
    const play = await findPlay(kept.title, kept.artist);
    const match = play ? null : await searchDeezer(kept.title, kept.artist);
    const isrc = play?.isrc ?? toIsrc(match?.isrc);
    const resolved = play
      ? await resolveArtist(kept.artist)
      : match
        ? await resolveKeptArtist(kept.artist, { title: kept.title, isrc })
        : null;
    if (!resolved) continue;
    await db
      .update(likedTracks)
      .set({ artistId: resolved.id, ...(isrc ? { isrc } : {}) })
      .where(eq(likedTracks.id, kept.id));
    tied += 1;
  } catch (err) {
    failed += 1;
    console.error(`${kept.artist} — ${kept.title}: ${(err as Error).message}`);
  }
}

const [total] = await db.select({ n: count() }).from(artist);
const [byIsrc] = await db
  .select({ n: count() })
  .from(artist)
  .where(eq(artist.identifiedBy, 'isrc'));
const [bridged] = await db.select({ n: count() }).from(artist).where(isNotNull(artist.mbid));
console.log(
  `${filled} of ${withoutIsrc.length} plays given their ISRC; ${played.length} played names, ` +
    `${failed} failed; ${total?.n ?? 0} artists (${outcomes.changed} identities changed, ` +
    `${outcomes.failed} could not be checked), ${byIsrc?.n ?? 0} identified by ISRC, ` +
    `${bridged?.n ?? 0} with an MBID; ${tied} of ${untied.length} kept tracks tied to their artist`
);
await pool.end();
