import { count, eq, isNotNull, isNull } from 'drizzle-orm';
import { azuracastGet } from '../lib/azuracast';
import { db, pool } from '../db/index';
import { artist, likedTracks, radioPlay } from '../db/schema';
import { toIsrc } from '../lib/isrc';
import { artistKey, normalizeArtistName } from '../lib/artistName';
import { reidentifyArtists, resolveArtist } from '../services/artistResolver';
import { findPlay } from '../services/radioPlayService';
import { shareRateWithBackend } from '../services/musicbrainzService';

// One-off catch-up (docs/vision.md §4.4), run by hand after a deploy that
// changes identity. Plays recorded before AzuraCast reported ISRCs get theirs
// from the station's media, matched on artist and title once normalised; then
// every known artist is identified again, and every played artist resolved.
// Last, each kept track not yet tied to its artist is tied through its play;
// one kept before plays were recorded stays untied. New plays and new kept
// tracks are handled as they come. Sequential on purpose: MusicBrainz allows
// one request per second.
const key = (artistName: string, title: string): string =>
  `${artistKey(artistName)}|${normalizeArtistName(title)}`;

shareRateWithBackend();

const media = (await azuracastGet('files', 60_000)) as Array<{
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

// Every known artist identified again by MusicBrainz alone: an MBID the Deezer API once led to
// (docs/vision.md §2.5), or one taken from an ISRC before answers were checked, is replaced or
// cleared; one found again is left as it was. The row and its page stay. Before the
// played names, so that what it changes is counted here.
const outcomes = await reidentifyArtists();

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

const untied = await db
  .select({ id: likedTracks.id, title: likedTracks.title, artist: likedTracks.artist })
  .from(likedTracks)
  .where(isNull(likedTracks.artistId));
let tied = 0;
for (const kept of untied) {
  try {
    const play = await findPlay(kept.title, kept.artist);
    const resolved = play ? await resolveArtist(kept.artist) : null;
    if (!play || !resolved) continue;
    await db
      .update(likedTracks)
      .set({ artistId: resolved.id, ...(play.isrc ? { isrc: play.isrc } : {}) })
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
    `${failed} failed; ${total?.n ?? 0} artists identified again: ${outcomes.same} same MBID, ` +
    `${outcomes.changed} changed, ${outcomes.cleared} cleared, ${outcomes.gained} gained, ` +
    `${outcomes.none} still without, ${outcomes.held} held by another row, ` +
    `${outcomes.unplayed} unplayed, ${outcomes.failed} could not be checked; ` +
    `${byIsrc?.n ?? 0} identified by ISRC, ` +
    `${bridged?.n ?? 0} with an MBID; ${tied} of ${untied.length} kept tracks tied to their artist`
);
await pool.end();
