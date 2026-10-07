import type { ArtistProfile, SiteLocale } from '@aubesonore/shared-types/client';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { artist, artistProfile, artistSlug } from '../db/schema';
import { logger } from '../lib/logger';
import type { Lookup } from '../lib/lookup';
import { createSingleFlight } from '../lib/singleFlight';
import { deezerArtistUrl, getArtist } from './deezerService';
import { ensureMbid } from './artistResolver';
import { getArtistIdentity, type ArtistIdentity } from './musilogyService';
import { getSummary } from './wikipediaService';
import { parseMbid } from '../validators/musilogyValidator';

const SOURCE_TIMEOUT_MS = 6_000;
// A profile older than this is served as it is and refreshed behind the answer.
const FRESH_MS = 7 * 24 * 60 * 60 * 1000;

type ArtistRow = typeof artist.$inferSelect;
type StoredProfile = typeof artistProfile.$inferSelect;

const NONE: Lookup<never> = { status: 'none' };

/** The dump's word on the artist, or a failure while musilogy is not loaded or fails. */
async function identityOf(mbid: string | null): Promise<Lookup<ArtistIdentity>> {
  if (!mbid) return NONE;
  try {
    const identity = await getArtistIdentity(mbid);
    return identity ? { status: 'found', value: identity } : NONE;
  } catch (err) {
    logger.warn('artistProfile.source_failed', {
      label: 'musilogy',
      message: (err as Error).message,
    });
    return { status: 'failed' };
  }
}

// A slow source counts as a failed one: its section keeps what was stored.
async function bounded<V>(label: string, work: Promise<Lookup<V>>): Promise<Lookup<V>> {
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('source timeout')), SOURCE_TIMEOUT_MS)
      ),
    ]);
  } catch (err) {
    logger.warn('artistProfile.source_failed', { label, message: (err as Error).message });
    return { status: 'failed' };
  }
}

/** What a lookup gives, or what was stored before when the source failed. */
function settle<V, T>(lookup: Lookup<V>, read: (value: V) => T, previous: T): T | null {
  if (lookup.status === 'found') return read(lookup.value);
  return lookup.status === 'none' ? null : previous;
}

const refreshing = createSingleFlight<StoredProfile>();

/**
 * Asks the live sources again and stores their answers (docs/vision.md §4.6):
 * the Deezer portrait, and the Wikipedia openings of the Wikidata item the
 * dump names. A source that fails leaves its section as stored, and the
 * profile keeps its old date, so the next view retries.
 */
function refresh(
  row: ArtistRow,
  identity: Lookup<ArtistIdentity>,
  previous: StoredProfile | null
): Promise<StoredProfile> {
  return refreshing(row.id, async () => {
    const wikidataId = identity.status === 'found' ? identity.value.wikidataId : null;
    const [deezer, fr, en] = await Promise.all([
      row.deezerId ? bounded('deezer', getArtist(row.deezerId)) : NONE,
      wikidataId ? bounded('wikipedia', getSummary(wikidataId, 'fr')) : NONE,
      wikidataId ? bounded('wikipedia', getSummary(wikidataId, 'en')) : NONE,
    ]);
    // Without the dump's answer, the article to ask is unknown: the stored
    // openings stay, and so does the date.
    const unknown = identity.status === 'failed';
    const failed = unknown || [deezer, fr, en].some((lookup) => lookup.status === 'failed');
    const next: StoredProfile = {
      artistId: row.id,
      image: settle(deezer, (found) => found.picture, previous?.image ?? null),
      summaryFr: unknown
        ? (previous?.summaryFr ?? null)
        : settle(fr, (summary) => summary, previous?.summaryFr ?? null),
      summaryEn: unknown
        ? (previous?.summaryEn ?? null)
        : settle(en, (summary) => summary, previous?.summaryEn ?? null),
      refreshedAt: failed ? (previous?.refreshedAt ?? new Date(0)) : new Date(),
    };
    await db
      .insert(artistProfile)
      .values(next)
      .onConflictDoUpdate({ target: artistProfile.artistId, set: next });
    return next;
  });
}

/**
 * The page of an artist the antenna never played, made from what Musilogy
 * knows of its MBID (docs/vision.md §5): no row is stored for it, so a crawler
 * walking Musilogy fills no table. The portrait and the Wikipedia opening are
 * the live sources' cached answers. Null when the dump does not know the
 * MBID; MusilogyUnavailable while it is not loaded.
 */
async function unplayedProfile(mbid: string, locale: SiteLocale): Promise<ArtistProfile | null> {
  const identity = await getArtistIdentity(mbid);
  if (!identity) return null;
  const [deezer, summary] = await Promise.all([
    identity.deezerId ? bounded('deezer', getArtist(identity.deezerId)) : NONE,
    identity.wikidataId ? bounded('wikipedia', getSummary(identity.wikidataId, locale)) : NONE,
  ]);
  return {
    id: mbid,
    name: identity.name,
    slug: mbid,
    mbid,
    played: false,
    image: (deezer.status === 'found' ? deezer.value.picture : null) ?? identity.firstCover,
    facts: identity.facts,
    summary: summary.status === 'found' ? summary.value : null,
    links: [
      ...(identity.deezerId
        ? [{ platform: 'deezer' as const, url: deezerArtistUrl(identity.deezerId) }]
        : []),
      ...identity.links,
    ],
  };
}

/**
 * An artist page by its slug, or by its MBID: the antenna's page when it
 * played the artist (its slug then is the address to send the reader to),
 * the page made from Musilogy otherwise.
 */
export async function getArtistProfile(
  key: string,
  locale: SiteLocale
): Promise<ArtistProfile | null> {
  // A key that is an MBID is the address of an artist page without a slug.
  const mbid = parseMbid(key);
  const rows = await db
    .select()
    .from(artistSlug)
    .innerJoin(artist, eq(artist.id, artistSlug.artistId))
    .leftJoin(artistProfile, eq(artistProfile.artistId, artist.id))
    .where(mbid ? eq(artist.mbid, mbid) : eq(artistSlug.slug, key))
    .limit(1);

  const found = rows[0];
  if (!found) return mbid ? unplayedProfile(mbid, locale) : null;
  const row = found.artist;
  const { slug } = found.artist_slug;
  const { id } = row;

  // The dump is local: read on every view, cached by musilogyService. The
  // first view waits for the live sources; later ones never do.
  const identity = await identityOf(await ensureMbid(row));
  let stored = found.artist_profile;
  if (!stored) {
    stored = await refresh(row, identity, null);
  } else if (Date.now() - stored.refreshedAt.getTime() > FRESH_MS) {
    const previous = stored;
    void refresh(row, identity, previous).catch((err: unknown) => {
      logger.warn('artistProfile.refresh_failed', { id, message: (err as Error).message });
    });
  }

  return {
    id: row.id,
    name: row.displayName,
    slug,
    mbid: row.mbid,
    played: true,
    image: stored.image ?? (identity.status === 'found' ? identity.value.firstCover : null),
    facts: identity.status === 'found' ? identity.value.facts : null,
    summary: locale === 'fr' ? stored.summaryFr : stored.summaryEn,
    links: [
      ...(row.deezerId
        ? [{ platform: 'deezer' as const, url: deezerArtistUrl(row.deezerId) }]
        : []),
      ...(identity.status === 'found' ? identity.value.links : []),
    ],
  };
}
