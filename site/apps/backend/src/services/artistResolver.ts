import { randomUUID } from 'node:crypto';
import { and, desc, DrizzleQueryError, eq, isNull, or, sql } from 'drizzle-orm';
import { db } from '../db';
import { artist, artistProfile, artistSlug, likedTracks, radioPlay } from '../db/schema';
import { logger } from '../lib/logger';
import { findTrackByIsrc, searchArtist } from './deezerService';
import { findMbidByDeezerId, findRecordingsByIsrc, getArtistByMbid } from './musicbrainzService';
import { fetchNowPlaying } from './nowPlaying';

// Only explicit featuring markers. Splitting on `&`, `+`, `x` or `,` would
// destroy legitimate names ("Simon & Garfunkel", "Earth, Wind & Fire").
const FEATURING_SEPARATOR = /\s+(?:feat\.?|ft\.?|featuring)\s+/i;

export function primaryArtistName(raw: string): string {
  return (raw.split(FEATURING_SEPARATOR)[0] ?? raw).trim();
}

/**
 * The resolution key. Letters and digits of every script survive, so "坂本龍一"
 * or "Кино" get a key; accents and punctuation do not, so "Beyoncé" and
 * "beyonce" share one.
 */
export function normalizeArtistName(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export function slugify(name: string): string {
  return normalizeArtistName(name).replace(/ /g, '-');
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Far more homonyms than the antenna will ever play under one name.
const MAX_SUFFIX = 100;

/**
 * Gives the artist the first free slug of its name, the name alone or with a
 * suffix (`cassius`, `cassius-2`…). A slug is never taken back: whoever holds
 * it keeps it, so the next homonym gets the next suffix.
 */
async function claimSlug(tx: Tx, artistId: string, base: string): Promise<string> {
  for (let n = 1; n <= MAX_SUFFIX; n += 1) {
    const slug = n === 1 ? base : `${base}-${n}`;
    const claimed = await tx
      .insert(artistSlug)
      .values({ slug, artistId })
      .onConflictDoNothing({ target: artistSlug.slug })
      .returning({ slug: artistSlug.slug });
    if (claimed[0]) return claimed[0].slug;
  }
  throw new Error(`artist slug: no free suffix for "${base}"`);
}

type Resolved = { id: string; slug: string };
type Identity = { id: string; deezerId: string | null; mbid: string | null };
type Row = Resolved & Identity & { identifiedBy: 'isrc' | 'name' };

const ROW = {
  id: artist.id,
  slug: artistSlug.slug,
  deezerId: artist.deezerId,
  mbid: artist.mbid,
  identifiedBy: artist.identifiedBy,
};

async function findBy(normalizedName: string): Promise<Row | null> {
  const rows = await db
    .select(ROW)
    .from(artist)
    .innerJoin(artistSlug, eq(artistSlug.artistId, artist.id))
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
  return current !== null &&
    normalizeArtistName(primaryArtistName(current.artist)) === normalizedName
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
  const mbids = new Set(
    (recordings.status === 'found' ? recordings.value : [])
      .filter((recording) => sameTitle(played.title, recording.title))
      .flatMap((recording) => recording.credits.filter((c) => credited(c.names)))
      .map((credit) => credit.mbid)
  );
  const [onlyMbid] = mbids;
  let mbid = mbids.size === 1 && onlyMbid ? onlyMbid : null;

  let deezerId: string | null = null;
  if (mbid) {
    const page = await getArtistByMbid(mbid);
    if (page.status === 'failed') return 'failed';
    deezerId = page.status === 'found' ? page.value.deezerId : null;
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
 * Who played a track: its ISRC when the answer proves to be that track, then
 * the name bound to the played title for what the ISRC left unknown (Deezer
 * through `searchArtist`, MusicBrainz through the Deezer link it declares).
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
    if (identity && identity !== 'failed' && identity.identifiedBy === 'isrc') {
      await writeIdentity(existing, identity);
    } else {
      await ensureMbid(existing);
    }
    return { id: existing.id, slug: existing.slug };
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
    const base = slugify(identity.displayName) || normalizedName.replace(/ /g, '-');
    return { id: inserted[0].id, slug: await claimSlug(tx, inserted[0].id, base) };
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
    .innerJoin(artistSlug, eq(artistSlug.artistId, artist.id))
    .where(or(...keys))
    .limit(1);
  return rows[0] ?? null;
}
