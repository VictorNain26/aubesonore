import { randomUUID } from 'node:crypto';
import { and, DrizzleQueryError, eq, isNull } from 'drizzle-orm';
import { db } from '../db';
import { artist, radioPlay } from '../db/schema';
import { logger } from '../lib/logger';
import { searchArtist } from './deezerService';
import { findMbidByDeezerId } from './musicbrainzService';
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

async function findBy(normalizedName: string): Promise<(Resolved & Identity) | null> {
  const rows = await db
    .select({ id: artist.id, slug: artist.slug, deezerId: artist.deezerId, mbid: artist.mbid })
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

/**
 * A title the antenna played by this artist, or null when it never played
 * them: pages exist for what the antenna played, never for a name typed into
 * the API. The title is also what tells homonyms apart on Deezer.
 */
async function playedTitle(normalizedName: string): Promise<string | null> {
  const rows = await db
    .select({ title: radioPlay.title })
    .from(radioPlay)
    .where(eq(radioPlay.artistNormalized, normalizedName))
    .limit(1);
  if (rows[0]) return rows[0].title;

  // The watcher records a track up to a minute after it starts.
  const current = await fetchNowPlaying().catch(() => null);
  return current !== null &&
    normalizeArtistName(primaryArtistName(current.artist)) === normalizedName
    ? current.title
    : null;
}

export async function resolveArtist(rawName: string): Promise<Resolved | null> {
  const primary = primaryArtistName(rawName);
  const normalizedName = normalizeArtistName(primary);
  if (!normalizedName) return null;

  const existing = await findBy(normalizedName);
  if (existing) {
    await ensureMbid(existing);
    return { id: existing.id, slug: existing.slug };
  }

  const title = await playedTitle(normalizedName);
  if (title === null) return null;

  const search = await searchArtist(primary, title, normalizeArtistName);
  // Deezer down: resolve again next time rather than persist a false "unknown".
  if (search.status === 'failed') return null;

  const match = search.status === 'match' ? search.artist : null;
  const displayName = match?.name ?? primary;
  const inserted = await db
    .insert(artist)
    .values({
      id: randomUUID(),
      normalizedName,
      displayName,
      slug: slugify(displayName),
      deezerId: match?.id ?? null,
      mbid: null,
    })
    .onConflictDoNothing()
    .returning({ id: artist.id, slug: artist.slug });
  // Lost the insert race against a concurrent resolution: read the winner. A
  // Deezer match needs an equal normalized name, so two rows never share one.
  const row = inserted[0] ?? (await findBy(normalizedName));
  if (!row) return null;
  await ensureMbid({ id: row.id, deezerId: match?.id ?? null, mbid: null });
  return { id: row.id, slug: row.slug };
}
