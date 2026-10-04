import { randomUUID } from 'node:crypto';
import { and, desc, DrizzleQueryError, eq, isNull, or, sql } from 'drizzle-orm';
import { db } from '../db';
import { artist, radioPlay } from '../db/schema';
import { logger } from '../lib/logger';
import { findArtistByIsrc, searchArtist } from './deezerService';
import { findMbidByDeezerId, findMbidByIsrc, getArtistByMbid } from './musicbrainzService';
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

type Resolved = { id: string; slug: string };
type Identity = { id: string; deezerId: string | null; mbid: string | null };
type Row = Resolved & Identity & { identifiedBy: 'isrc' | 'name' };

const ROW = {
  id: artist.id,
  slug: artist.slug,
  deezerId: artist.deezerId,
  mbid: artist.mbid,
  identifiedBy: artist.identifiedBy,
};

async function findBy(normalizedName: string): Promise<Row | null> {
  const rows = await db
    .select(ROW)
    .from(artist)
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

type Played = { title: string; isrc: string | null };

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

/**
 * The identity a played track's ISRC gives (docs/vision.md §4.4): the
 * MusicBrainz artist of the recording, the Deezer link that artist declares,
 * else Deezer's own ISRC lookup, else the MusicBrainz artist of that Deezer
 * link. Null when no source knows the code; 'failed' when one could not
 * answer, so the next play retries rather than settle for a name.
 */
async function identifyByIsrc(isrc: string): Promise<Identified | null | 'failed'> {
  const recording = await findMbidByIsrc(isrc);
  if (recording.status === 'failed') return 'failed';
  let mbid = recording.status === 'found' ? recording.value : null;

  let deezerId: string | null = null;
  if (mbid) {
    const page = await getArtistByMbid(mbid);
    if (page.status === 'failed') return 'failed';
    deezerId = page.status === 'found' ? page.value.deezerId : null;
  }
  if (!deezerId) {
    const track = await findArtistByIsrc(isrc);
    if (track.status === 'failed') return 'failed';
    deezerId = track.status === 'match' ? track.artist.id : null;
  }
  if (!mbid && deezerId) {
    const linked = await findMbidByDeezerId(deezerId);
    if (linked.status === 'failed') return 'failed';
    mbid = linked.status === 'found' ? linked.value : null;
  }
  return mbid || deezerId ? { deezerId, mbid } : null;
}

/**
 * A row first bound by its name takes the identity its ISRC gives, which wins
 * over the name: the code designates the recording, a name can be a homonym's.
 */
async function reidentify(row: Row, identified: Identified): Promise<void> {
  try {
    await db
      .update(artist)
      .set({
        deezerId: identified.deezerId ?? row.deezerId,
        mbid: identified.mbid ?? row.mbid,
        identifiedBy: 'isrc',
      })
      .where(eq(artist.id, row.id));
  } catch (err) {
    // Another row holds that identity: two spellings of one artist. The row
    // keeps its name-bound identity; any other failure propagates.
    if (!isUniqueViolation(err)) throw err;
    logger.warn('artist.identity_not_written', {
      id: row.id,
      ...identified,
      message: (err as Error).message,
    });
  }
}

export async function resolveArtist(rawName: string): Promise<Resolved | null> {
  const primary = primaryArtistName(rawName);
  const normalizedName = normalizeArtistName(primary);
  if (!normalizedName) return null;

  const existing = await findBy(normalizedName);
  if (existing) {
    const played = existing.identifiedBy === 'name' ? await playedTrack(normalizedName) : null;
    const identified = played?.isrc ? await identifyByIsrc(played.isrc) : null;
    if (identified && identified !== 'failed') await reidentify(existing, identified);
    else await ensureMbid(existing);
    return { id: existing.id, slug: existing.slug };
  }

  const played = await playedTrack(normalizedName);
  if (played === null) return null;

  const identified = played.isrc ? await identifyByIsrc(played.isrc) : null;
  // A source down: resolve again next time rather than persist a name guess.
  if (identified === 'failed') return null;

  let identity: Identified & { displayName: string; identifiedBy: 'isrc' | 'name' };
  if (identified) {
    identity = { ...identified, displayName: primary, identifiedBy: 'isrc' };
  } else {
    const search = await searchArtist(primary, played.title, normalizeArtistName);
    // Deezer down: resolve again next time rather than persist a false "unknown".
    if (search.status === 'failed') return null;
    const match = search.status === 'match' ? search.artist : null;
    identity = {
      deezerId: match?.id ?? null,
      mbid: null,
      displayName: match?.name ?? primary,
      identifiedBy: 'name',
    };
  }

  const inserted = await db
    .insert(artist)
    .values({
      id: randomUUID(),
      normalizedName,
      displayName: identity.displayName,
      slug: slugify(identity.displayName),
      deezerId: identity.deezerId,
      mbid: identity.mbid,
      identifiedBy: identity.identifiedBy,
    })
    .onConflictDoNothing()
    .returning({ id: artist.id, slug: artist.slug });
  // Nothing inserted: a concurrent resolution of this name won the race, or
  // another spelling of the same artist already holds this identity, and its
  // page is this artist's page.
  const row =
    inserted[0] ??
    (await findBy(normalizedName)) ??
    (await findByIdentity(identity.deezerId, identity.mbid));
  if (!row) return null;
  if (identity.identifiedBy === 'name') {
    await ensureMbid({ id: row.id, deezerId: identity.deezerId, mbid: null });
  }
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
    .where(or(...keys))
    .limit(1);
  return rows[0] ?? null;
}
