import { randomUUID } from 'node:crypto';
import { and, desc, DrizzleQueryError, eq, isNull, or, sql } from 'drizzle-orm';
import { db } from '../db';
import { artist, artistProfile, likedTracks, radioPlay } from '../db/schema';
import { normalizeArtistName } from '../lib/artistName';
import { logger } from '../lib/logger';
import type { Lookup } from '../lib/lookup';
import { findTrackByIsrc, searchArtist } from './deezerService';
import {
  findDeezerIdByMbid,
  findMbidByDeezerId,
  findRecordingsByIsrc,
  findRecordingsByTitle,
  type IsrcRecording,
} from './musicbrainzService';
import { fetchNowPlaying } from './nowPlaying';
import {
  bindArtistSlug,
  claimSlug,
  mbidSlug,
  ownSlug,
  pageSlug,
  slugOfArtistPage,
} from './artistSlugs';

// Only explicit featuring markers. Splitting on `&`, `+`, `x` or `,` would
// destroy legitimate names ("Simon & Garfunkel", "Earth, Wind & Fire").
const FEATURING_SEPARATOR = /\s+(?:feat\.?|ft\.?|featuring)\s+/i;

export function primaryArtistName(raw: string): string {
  return (raw.split(FEATURING_SEPARATOR)[0] ?? raw).trim();
}

/** The key a raw AzuraCast name is stored and compared under: its first credited artist, normalized. */
export function artistKey(raw: string): string {
  return normalizeArtistName(primaryArtistName(raw));
}

type Resolved = { id: string; slug: string };
type Identity = { id: string; displayName: string; deezerId: string | null; mbid: string | null };
type Row = Resolved & Identity & { identifiedBy: 'isrc' | 'name' };

const ROW = {
  id: artist.id,
  slug: pageSlug,
  displayName: artist.displayName,
  deezerId: artist.deezerId,
  mbid: artist.mbid,
  identifiedBy: artist.identifiedBy,
};

async function findBy(normalizedName: string): Promise<Row | null> {
  const rows = await db
    .select(ROW)
    .from(artist)
    .leftJoin(mbidSlug, eq(mbidSlug.mbid, artist.mbid))
    .leftJoin(ownSlug, eq(ownSlug.artistId, artist.id))
    .where(eq(artist.normalizedName, normalizedName))
    .limit(1);
  return rows[0] ?? null;
}

function isUniqueViolation(err: unknown): boolean {
  return (
    err instanceof DrizzleQueryError &&
    (err.cause as { code?: string } | undefined)?.code === '23505'
  );
}

/**
 * The artist's MBID, the pivot to Musilogy (docs/vision.md
 * §4.4), found through the Deezer link MusicBrainz declares and written once
 * found. Nothing found, or MusicBrainz failing, writes nothing: the next call
 * tries again.
 */
export async function ensureMbid(row: Identity): Promise<string | null> {
  if (row.mbid || !row.deezerId) return row.mbid;
  const found = await findMbidByDeezerId(row.deezerId);
  if (found.status !== 'found') return null;
  try {
    await db
      .update(artist)
      .set({ mbid: found.value })
      .where(and(eq(artist.id, row.id), isNull(artist.mbid)));
    await bindArtistSlug(db, row.id, found.value, row.displayName);
  } catch (err) {
    // artist_mbid_unique: another row already holds it, two spellings of one
    // artist. The page still shows the MusicBrainz facts; only the write is
    // lost. Any other failure is not this case and propagates.
    if (!isUniqueViolation(err)) throw err;
    logger.warn('artist.mbid_not_written', {
      id: row.id,
      mbid: found.value,
      message: (err as Error).message,
    });
  }
  return found.value;
}

export type Played = { title: string; isrc: string | null };

/**
 * A track the antenna played by this artist, one with an ISRC when there is
 * one, or null when it never played them: pages exist for what the antenna
 * played, never for a name typed into the API. Both sources are the server's
 * own, so a caller cannot slip another recording's ISRC in.
 */
async function playedTrack(normalizedName: string): Promise<Played | null> {
  const rows = await db
    .select({ title: radioPlay.title, isrc: radioPlay.isrc })
    .from(radioPlay)
    .where(eq(radioPlay.artistNormalized, normalizedName))
    .orderBy(sql`${radioPlay.isrc} IS NULL`, desc(radioPlay.playedAt))
    .limit(1);
  if (rows[0]) return rows[0];

  // The watcher records a track up to a minute after it starts.
  const current = await fetchNowPlaying().catch(() => null);
  return current !== null && artistKey(current.artist) === normalizedName
    ? { title: current.title, isrc: current.isrc }
    : null;
}

type Identified = { deezerId: string | null; mbid: string | null };
type Identification = Identified & { identifiedBy: 'isrc' | 'name'; displayName: string };

// Compared, not keyed: an apostrophe is typed or left out (« Lets Go Surfing »
// played, « Let’s Go Surfing » in MusicBrainz), so it is dropped, not spaced.
function comparable(text: string): string {
  return normalizeArtistName(text.replace(/['’ʼ`´]/g, ''));
}

/**
 * The same title, versions aside: « Song » and « Song (Radio Edit) » match,
 * two different songs do not.
 */
export function sameTitle(played: string, other: string): boolean {
  const a = comparable(played);
  const b = comparable(other);
  return a === b || a.startsWith(`${b} `) || b.startsWith(`${a} `);
}

/**
 * The one artist credited under the played name on a recording of the played title, whatever
 * gave the recordings (an ISRC, a search); null when none is, or several.
 */
function creditedArtist(
  recordings: readonly IsrcRecording[],
  played: Played,
  primary: string,
  same: (played: string, other: string) => boolean = sameTitle
): string | null {
  const playedName = comparable(primary);
  const mbids = new Set(
    recordings
      .filter((recording) => same(played.title, recording.title))
      .flatMap((recording) =>
        recording.credits.filter((c) => c.names.some((name) => comparable(name) === playedName))
      )
      .map((credit) => credit.mbid)
  );
  const [only] = mbids;
  return mbids.size === 1 && only ? only : null;
}

// A version said in brackets or after a dash: « Song (feat. X) », « Song - 2011 Remaster ».
const VERSION =
  /\s*(?:[([][^)\]]*\b(?:feat|ft|with|remaster(?:ed)?|version|edit|mix|live|mono|stereo)\b[^)\]]*[)\]]|\s-\s.*\b(?:remaster(?:ed)?|version|edit|mix|live|mono|stereo)\b.*)/gi;

/** A title without its version: what MusicBrainz names a recording (Style guidelines). */
export function bareTitle(title: string): string {
  return title.replace(VERSION, '').trim();
}

/**
 * The same song exactly, versions aside: the search's answers are only as good as the title, so
 * no prefix of it counts (« Home » is not « Home Again »), unlike an ISRC's.
 */
function exactTitle(played: string, other: string): boolean {
  return comparable(bareTitle(played)) === comparable(bareTitle(other));
}

/**
 * The identity a played track's ISRC gives (docs/vision.md §4.4), once the
 * answer is shown to be that track: an ISRC can be filed on another
 * recording, or credit another artist (measured 2026-10-04: Paul McCartney's
 * track credited to Wings, Daniel Avery's to ANNA, The Pirouettes' answered
 * by another Deezer track). MusicBrainz must name a recording of the played
 * title crediting the played name; Deezer, the same. Each identity then
 * completes the other through the link MusicBrainz declares. Null when no
 * answer is the played track; 'failed' when a source could not answer.
 */
async function identifyByIsrc(
  isrc: string,
  played: Played,
  primary: string
): Promise<Identified | null | 'failed'> {
  const playedName = comparable(primary);
  const credited = (names: string[]) => names.some((name) => comparable(name) === playedName);

  const recordings = await findRecordingsByIsrc(isrc);
  if (recordings.status === 'failed') return 'failed';
  let mbid = creditedArtist(recordings.status === 'found' ? recordings.value : [], played, primary);

  let deezerId: string | null = null;
  if (mbid) {
    const declared = await findDeezerIdByMbid(mbid);
    if (declared.status === 'failed') return 'failed';
    deezerId = declared.status === 'found' ? declared.value : null;
  }
  if (!deezerId) {
    const track = await findTrackByIsrc(isrc);
    if (track.status === 'failed') return 'failed';
    if (track.status === 'found' && sameTitle(played.title, track.value.title)) {
      deezerId = track.value.artists.find((a) => credited([a.name]))?.id ?? null;
    }
  }
  if (!mbid && deezerId) {
    const linked = await findMbidByDeezerId(deezerId);
    if (linked.status === 'failed') return 'failed';
    mbid = linked.status === 'found' ? linked.value : null;
  }
  return mbid || deezerId ? { deezerId, mbid } : null;
}

/**
 * The MBID of the one artist credited under the played name on a recording of exactly the played
 * title, from MusicBrainz's search; refused when that artist declares another Deezer artist than
 * the one the name was bound to (two homonyms).
 */
async function identifyByTitle(
  primary: string,
  played: Played,
  deezerId: string | null
): Promise<Lookup<string>> {
  const found = await findRecordingsByTitle(primary, bareTitle(played.title));
  if (found.status === 'failed') return found;
  const mbid =
    found.status === 'found' ? creditedArtist(found.value, played, primary, exactTitle) : null;
  if (!mbid) return { status: 'none' };
  if (!deezerId) return { status: 'found', value: mbid };
  const declared = await findDeezerIdByMbid(mbid);
  if (declared.status === 'failed') return declared;
  return declared.status === 'found' && declared.value !== deezerId
    ? { status: 'none' }
    : { status: 'found', value: mbid };
}

/**
 * Who played a track: its ISRC when the answer proves to be that track, then
 * the name bound to the played title for what the ISRC left unknown (Deezer
 * through `searchArtist`, MusicBrainz through the Deezer link it declares, else
 * through a recording of that title credited to that name).
 * 'failed' when a source could not answer: nothing is written, the next play
 * retries.
 */
async function identify(primary: string, played: Played): Promise<Identification | 'failed'> {
  const byIsrc = played.isrc ? await identifyByIsrc(played.isrc, played, primary) : null;
  if (byIsrc === 'failed') return 'failed';

  let deezerId = byIsrc?.deezerId ?? null;
  let mbid = byIsrc?.mbid ?? null;
  let displayName = primary;
  if (!deezerId) {
    const search = await searchArtist(primary, played.title, normalizeArtistName);
    if (search.status === 'failed') return 'failed';
    if (search.status === 'match') {
      deezerId = search.artist.id;
      if (!byIsrc) displayName = search.artist.name;
    }
  }
  if (!mbid && deezerId) {
    const linked = await findMbidByDeezerId(deezerId);
    if (linked.status === 'failed') return 'failed';
    mbid = linked.status === 'found' ? linked.value : null;
  }
  // Still no MBID: a recording of the played title credited to the name. After an ISRC too, which
  // most often leaves just that (62 of the 65 played artists without an MBID had a Deezer artist
  // its ISRC checked, 2026-10-12): the artist found must then declare no other Deezer page.
  if (!mbid && bareTitle(played.title) !== '') {
    const found = await identifyByTitle(primary, played, deezerId);
    if (found.status === 'failed') return 'failed';
    mbid = found.status === 'found' ? found.value : null;
  }
  return { deezerId, mbid, identifiedBy: byIsrc ? 'isrc' : 'name', displayName };
}

/**
 * Writes an identity as found, nothing kept from the one it replaces, and
 * drops the stored profile when the identity changed: its portrait and facts
 * were another artist's. Another row holding that identity (two spellings of
 * one artist) leaves this one as it was, logged.
 */
async function writeIdentity(row: Row, identity: Identification): Promise<boolean> {
  const changed = identity.deezerId !== row.deezerId || identity.mbid !== row.mbid;
  try {
    await db
      .update(artist)
      .set({
        deezerId: identity.deezerId,
        mbid: identity.mbid,
        identifiedBy: identity.identifiedBy,
      })
      .where(eq(artist.id, row.id));
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    logger.warn('artist.identity_not_written', {
      id: row.id,
      deezerId: identity.deezerId,
      mbid: identity.mbid,
      message: (err as Error).message,
    });
    return false;
  }
  if (changed) await db.delete(artistProfile).where(eq(artistProfile.artistId, row.id));
  if (changed && identity.mbid)
    await bindArtistSlug(db, row.id, identity.mbid, identity.displayName);
  return changed;
}

/** A track kept of this artist, the evidence of an artist known only from a like. */
async function keptTrack(artistId: string): Promise<Played | null> {
  const rows = await db
    .select({ title: likedTracks.title, isrc: likedTracks.isrc })
    .from(likedTracks)
    .where(eq(likedTracks.artistId, artistId))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Identifies a known artist again from scratch, from its latest play, else a
 * track kept of it (`artists:resolve`): repairs identities taken from an ISRC
 * before answers were checked. 'unplayed' when neither exists.
 */
export async function reverifyArtist(
  normalizedName: string,
  displayName: string
): Promise<'changed' | 'kept' | 'unplayed' | 'failed'> {
  const row = await findBy(normalizedName);
  if (!row) return 'unplayed';
  const played = (await playedTrack(normalizedName)) ?? (await keptTrack(row.id));
  if (!played) return 'unplayed';
  const identity = await identify(displayName, played);
  if (identity === 'failed') return 'failed';
  return (await writeIdentity(row, identity)) ? 'changed' : 'kept';
}

export function resolveArtist(rawName: string): Promise<Resolved | null> {
  return resolveOn(rawName, playedTrack);
}

/**
 * For a track a listener kept before plays were recorded (`artists:resolve`):
 * the kept track, whose ISRC comes from its exact Deezer match, stands for the
 * play. Never reachable from a route, where any name could be typed.
 */
export function resolveKeptArtist(rawName: string, kept: Played): Promise<Resolved | null> {
  return resolveOn(rawName, () => Promise.resolve(kept));
}

async function resolveOn(
  rawName: string,
  evidence: (normalizedName: string) => Promise<Played | null>
): Promise<Resolved | null> {
  const primary = primaryArtistName(rawName);
  const normalizedName = normalizeArtistName(primary);
  if (!normalizedName) return null;

  const existing = await findBy(normalizedName);
  if (existing) {
    // A row bound by its name takes the identity a checked ISRC gives: the
    // code designates the recording, a name can be a homonym's.
    const played = existing.identifiedBy === 'name' ? await evidence(normalizedName) : null;
    const identity = played?.isrc ? await identify(primary, played) : null;
    const moved =
      identity && identity !== 'failed' && identity.identifiedBy === 'isrc'
        ? await writeIdentity(existing, identity)
        : existing.mbid === null && (await ensureMbid(existing)) !== null;
    // A new MBID can give the page another address: its MBID's slug.
    const slug = moved ? await slugOfArtistPage(existing.id) : existing.slug;
    return { id: existing.id, slug: slug ?? existing.slug };
  }

  const played = await evidence(normalizedName);
  if (played === null) return null;

  const identity = await identify(primary, played);
  // A source down: resolve again next time rather than persist a guess.
  if (identity === 'failed') return null;

  // The row and its slug land together: a page without an address would be unreachable.
  const created = await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(artist)
      .values({
        id: randomUUID(),
        normalizedName,
        displayName: identity.displayName,
        deezerId: identity.deezerId,
        mbid: identity.mbid,
        identifiedBy: identity.identifiedBy,
      })
      .onConflictDoNothing()
      .returning({ id: artist.id });
    if (!inserted[0]) return null;
    const id = inserted[0].id;
    // The page of an MBID is named by it, the one it may already have; a row names its own page
    // only when it has no MBID, or one whose name makes no slug.
    const byMbid = identity.mbid
      ? await claimSlug(tx, { mbid: identity.mbid }, identity.displayName)
      : null;
    const slug =
      byMbid ??
      (await claimSlug(tx, { artistId: id }, identity.displayName)) ??
      (await claimSlug(tx, { artistId: id }, normalizedName));
    if (!slug) throw new Error(`artist slug: none for "${normalizedName}"`);
    return { id, slug };
  });
  if (created) return created;
  // Nothing inserted: a concurrent resolution of this name won the race, or
  // another spelling of the same artist already holds this identity, and its
  // page is this artist's page.
  const row =
    (await findBy(normalizedName)) ?? (await findByIdentity(identity.deezerId, identity.mbid));
  if (!row) return null;
  return { id: row.id, slug: row.slug };
}

async function findByIdentity(deezerId: string | null, mbid: string | null): Promise<Row | null> {
  const keys = [
    ...(deezerId ? [eq(artist.deezerId, deezerId)] : []),
    ...(mbid ? [eq(artist.mbid, mbid)] : []),
  ];
  if (keys.length === 0) return null;
  const rows = await db
    .select(ROW)
    .from(artist)
    .leftJoin(mbidSlug, eq(mbidSlug.mbid, artist.mbid))
    .leftJoin(ownSlug, eq(ownSlug.artistId, artist.id))
    .where(or(...keys))
    .limit(1);
  return rows[0] ?? null;
}
