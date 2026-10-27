import { randomUUID } from 'node:crypto';
import { desc, eq, or, sql } from 'drizzle-orm';
import { db } from '../db';
import { isUniqueViolation } from '../db/errors';
import { artist, artistProfile, likedTracks, radioPlay } from '../db/schema';
import {
  artistKey,
  bareTitle,
  comparableName,
  normalizeArtistName,
  primaryArtistName,
  sameTitle,
} from '../lib/artistName';
import { logger } from '../lib/logger';
import type { Lookup } from '../lib/lookup';
import {
  findDeezerIdByMbid,
  findRecordingsByIsrc,
  findRecordingsByTitle,
  type IsrcRecording,
} from './musicbrainzService';
import { fetchNowPlaying } from './nowPlaying';
import {
  bindArtistSlug,
  claimSlug,
  homonymRank,
  mbidSlug,
  ownSlug,
  pageSlug,
  slugOfArtistPage,
} from './artistSlugs';

type Resolved = { id: string; slug: string };
// The row's page slug, null only while it has none: see pageOfRow.
type Row = {
  id: string;
  displayName: string;
  deezerId: string | null;
  mbid: string | null;
  slug: string | null;
  identifiedBy: 'isrc' | 'name';
};

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
  return current !== null && artistKey(current.artist) === normalizedName
    ? { title: current.title, isrc: current.isrc }
    : null;
}

type Identification = {
  deezerId: string | null;
  mbid: string | null;
  identifiedBy: 'isrc' | 'name';
  displayName: string;
};

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
  const playedName = comparableName(primary);
  const mbids = new Set(
    recordings
      .filter((recording) => same(played.title, recording.title))
      .flatMap((recording) =>
        recording.credits.filter((c) => c.names.some((name) => comparableName(name) === playedName))
      )
      .map((credit) => credit.mbid)
  );
  const [only] = mbids;
  return mbids.size === 1 && only ? only : null;
}

/**
 * The same song exactly, versions aside: the search's answers are only as good as the title, so
 * no prefix of it counts (« Home » is not « Home Again »), unlike an ISRC's.
 */
function exactTitle(played: string, other: string): boolean {
  return comparableName(bareTitle(played)) === comparableName(bareTitle(other));
}

/**
 * The MBID a played track's ISRC gives (docs/vision.md §4.4), once the answer is shown to be
 * that track: an ISRC can be filed on another recording, or credit another artist (measured
 * 2026-10-04: Paul McCartney's track credited to Wings, Daniel Avery's to ANNA). MusicBrainz
 * must name a recording of the played title crediting the played name.
 */
async function identifyByIsrc(
  isrc: string,
  played: Played,
  primary: string
): Promise<Lookup<string>> {
  const recordings = await findRecordingsByIsrc(isrc);
  if (recordings.status !== 'found') return recordings;
  const mbid = creditedArtist(recordings.value, played, primary);
  return mbid ? { status: 'found', value: mbid } : { status: 'none' };
}

/**
 * The MBID of the one artist credited under the played name on a recording of exactly the played
 * title, from MusicBrainz's search. Never the name alone: without a title, no search.
 */
async function identifyByTitle(primary: string, played: Played): Promise<Lookup<string>> {
  if (bareTitle(played.title) === '') return { status: 'none' };
  const found = await findRecordingsByTitle(primary, bareTitle(played.title));
  if (found.status !== 'found') return found;
  const mbid = creditedArtist(found.value, played, primary, exactTitle);
  return mbid ? { status: 'found', value: mbid } : { status: 'none' };
}

/**
 * Who played a track, from MusicBrainz alone: its ISRC when the answer proves to be that track,
 * else a recording of exactly the played title credited under the played name. The Deezer artist
 * is the one the MBID's MusicBrainz page declares (CC0), never Deezer's API, whose terms allow
 * only private use (docs/vision.md §2.5). 'failed' when a source could not answer: nothing is
 * written, the next play retries.
 */
async function identify(primary: string, played: Played): Promise<Identification | 'failed'> {
  const byIsrc = played.isrc ? await identifyByIsrc(played.isrc, played, primary) : null;
  if (byIsrc?.status === 'failed') return 'failed';
  const byTitle = byIsrc?.status === 'found' ? null : await identifyByTitle(primary, played);
  if (byTitle?.status === 'failed') return 'failed';

  const found = byIsrc?.status === 'found' ? byIsrc : byTitle;
  const mbid = found?.status === 'found' ? found.value : null;
  const declared = mbid ? await findDeezerIdByMbid(mbid) : null;
  if (declared?.status === 'failed') return 'failed';
  return {
    deezerId: declared?.status === 'found' ? declared.value : null,
    mbid,
    identifiedBy: byIsrc?.status === 'found' ? 'isrc' : 'name',
    displayName: primary,
  };
}

/**
 * Writes an identity as found, nothing kept from the one it replaces, and
 * drops the stored profile when the MBID changed: its portrait and facts
 * were another artist's. The Deezer id is only the link the MBID's page
 * declares, not an identity. Another row holding that MBID (two spellings of
 * one artist) leaves this one as it was, logged: 'held'.
 */
async function writeIdentity(
  row: Row,
  identity: Identification
): Promise<'changed' | 'unchanged' | 'held'> {
  const changed = identity.mbid !== row.mbid;
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
    return 'held';
  }
  if (!changed) return 'unchanged';
  await db.delete(artistProfile).where(eq(artistProfile.artistId, row.id));
  // The page is the new MBID's; without one, the row's own again, the slug it kept or a new one.
  if (identity.mbid) await bindArtistSlug(db, row.id, identity.mbid, identity.displayName);
  else await claimSlug(db, { artistId: row.id }, identity.displayName);
  return 'changed';
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

/** What identifying a known artist again did to its MBID. */
export type Reidentified =
  | 'same'
  | 'changed'
  | 'cleared'
  | 'gained'
  | 'none'
  | 'held'
  | 'unplayed'
  | 'failed';

/**
 * Identifies a known artist again from scratch, from its latest play, else a
 * track kept of it: an MBID found again is left as it was (only its Deezer
 * link read again), another one replaces it, none clears it; the row and its
 * page stay. 'unplayed' when neither a play nor a kept track exists.
 */
export async function reverifyArtist(
  normalizedName: string,
  displayName: string
): Promise<Reidentified> {
  const row = await findBy(normalizedName);
  if (!row) return 'unplayed';
  const played = (await playedTrack(normalizedName)) ?? (await keptTrack(row.id));
  if (!played) return 'unplayed';
  const identity = await identify(displayName, played);
  if (identity === 'failed') return 'failed';
  if ((await writeIdentity(row, identity)) === 'held') return 'held';
  if (identity.mbid === row.mbid) return identity.mbid ? 'same' : 'none';
  if (!row.mbid) return 'gained';
  return identity.mbid ? 'changed' : 'cleared';
}

/**
 * Every known artist identified again by MusicBrainz alone (`artists:resolve`), one after the
 * other at MusicBrainz's pace: the MBIDs the Deezer API once led to are read again (docs/vision.md
 * §2.5). Running it again changes nothing.
 */
export async function reidentifyArtists(): Promise<Record<Reidentified, number>> {
  const known = await db
    .select({ normalizedName: artist.normalizedName, displayName: artist.displayName })
    .from(artist)
    .orderBy(artist.normalizedName);
  const outcomes: Record<Reidentified, number> = {
    same: 0,
    changed: 0,
    cleared: 0,
    gained: 0,
    none: 0,
    held: 0,
    unplayed: 0,
    failed: 0,
  };
  for (const row of known) {
    let outcome: Reidentified;
    try {
      outcome = await reverifyArtist(row.normalizedName, row.displayName);
    } catch (err) {
      outcome = 'failed';
      logger.warn('artist.reidentify_failed', {
        name: row.displayName,
        message: (err as Error).message,
      });
    }
    outcomes[outcome] += 1;
    if (outcome === 'changed' || outcome === 'cleared' || outcome === 'gained') {
      logger.info('artist.reidentified', { name: row.displayName, outcome });
    }
  }
  return outcomes;
}

export async function resolveArtist(rawName: string): Promise<Resolved | null> {
  const primary = primaryArtistName(rawName);
  const normalizedName = normalizeArtistName(primary);
  if (!normalizedName) return null;

  const existing = await findBy(normalizedName);
  if (existing) {
    // A row bound by its name takes the identity a checked ISRC gives: the
    // code designates the recording, a name can be a homonym's. A row still
    // without an MBID, the bridge to Musilogy, takes one found since.
    const retry = existing.identifiedBy === 'name' || existing.mbid === null;
    const played = retry ? await playedTrack(normalizedName) : null;
    const identity =
      played && (played.isrc || existing.mbid === null) ? await identify(primary, played) : null;
    const moved =
      identity &&
      identity !== 'failed' &&
      (identity.identifiedBy === 'isrc' || (existing.mbid === null && identity.mbid !== null))
        ? (await writeIdentity(existing, identity)) === 'changed'
        : false;
    // A new MBID can give the page another address: its MBID's slug.
    const slug = moved ? await slugOfArtistPage(existing.id) : existing.slug;
    return pageOfRow({ ...existing, slug });
  }

  const played = await playedTrack(normalizedName);
  if (played === null) return null;

  const identity = await identify(primary, played);
  // A source down: resolve again next time rather than persist a guess.
  if (identity === 'failed') return null;

  // Read before the transaction, which would otherwise hold a second connection meanwhile.
  const rank = identity.mbid ? await homonymRank(identity.mbid) : undefined;
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
    // only when it has no MBID, one Musilogy cannot rank yet (its slug goes to the MBID's page
    // once published, artistSlugs.adoptRowSlugs), or one whose name makes no slug.
    const byMbid =
      identity.mbid && rank !== undefined
        ? await claimSlug(tx, { mbid: identity.mbid }, identity.displayName, rank)
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
  return pageOfRow(row);
}

/**
 * The page of a row: its page slug, or, should it have none (an MBID lost before this rule),
 * a slug of its own claimed now, so a played artist always has its page.
 */
async function pageOfRow(row: Pick<Row, 'id' | 'slug' | 'displayName'>): Promise<Resolved | null> {
  const slug = row.slug ?? (await claimSlug(db, { artistId: row.id }, row.displayName));
  return slug ? { id: row.id, slug } : null;
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
