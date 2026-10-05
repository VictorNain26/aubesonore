import type { ArtistProfile, ArtistRadioTitle, SiteLocale } from '@aubesonore/shared-types/client';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { artist, artistProfile, artistSlug } from '../db/schema';
import { logger } from '../lib/logger';
import type { Lookup } from '../lib/lookup';
import { createSingleFlight } from '../lib/singleFlight';
import { findTrackByIsrc, getArtist } from './deezerService';
import { ensureMbid, normalizeArtistName, sameTitle } from './artistResolver';
import { getArtistIdentity, type ArtistIdentity } from './musilogyService';
import { getTitlesByArtist, type PlayedTitle } from './radioPlayService';
import { getSummary } from './wikipediaService';

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
 * A played title on Deezer, from its ISRC, once the answer is shown to be it:
 * the same title, crediting this artist (an ISRC can be filed on another
 * recording, see identifyByIsrc). Anything else, or Deezer failing, gives no
 * link rather than another song's.
 */
async function deezerRecording(
  played: PlayedTitle,
  row: { deezerId: string | null; normalizedName: string }
): Promise<ArtistRadioTitle['deezer']> {
  if (!played.isrc) return null;
  const track = await findTrackByIsrc(played.isrc);
  if (track.status !== 'found' || !track.value.link) return null;
  if (!sameTitle(played.title, track.value.title)) return null;
  const credited = track.value.artists.some(
    (a) => a.id === row.deezerId || normalizeArtistName(a.name) === row.normalizedName
  );
  return credited ? { link: track.value.link, cover: track.value.cover } : null;
}

export async function getArtistProfile(
  slug: string,
  locale: SiteLocale
): Promise<ArtistProfile | null> {
  const rows = await db
    .select()
    .from(artistSlug)
    .innerJoin(artist, eq(artist.id, artistSlug.artistId))
    .leftJoin(artistProfile, eq(artistProfile.artistId, artist.id))
    .where(eq(artistSlug.slug, slug))
    .limit(1);

  const found = rows[0];
  if (!found) return null;
  const row = found.artist;
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

  const titles = await getTitlesByArtist(row.normalizedName).catch((err: unknown) => {
    logger.warn('artistProfile.source_failed', {
      label: 'radioPlay',
      message: (err as Error).message,
    });
    return [];
  });
  const playedOnRadio: ArtistRadioTitle[] = await Promise.all(
    titles.map(async (played) => ({
      title: played.title,
      artist: played.artist,
      plays: played.plays,
      lastPlayedAt: played.lastPlayedAt.toISOString(),
      deezer: await deezerRecording(played, row),
    }))
  );

  return {
    id: row.id,
    name: row.displayName,
    slug,
    mbid: row.mbid,
    image: stored.image,
    facts: identity.status === 'found' ? identity.value.facts : null,
    summary: locale === 'fr' ? stored.summaryFr : stored.summaryEn,
    links: [
      ...(row.deezerId
        ? [{ platform: 'deezer' as const, url: `https://www.deezer.com/artist/${row.deezerId}` }]
        : []),
      ...(identity.status === 'found' ? identity.value.links : []),
    ],
    playedOnRadio,
  };
}
