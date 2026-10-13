import type { PlatformLinks } from '@aubesonore/shared-types/client';
import { TtlCache } from '../lib/cache/ttlCache';
import { logger } from '../lib/logger';
import { similarity, artistMatch, songMatch } from '../lib/text/matchScore';
import { findTrackByIsrc, searchTrack, type DeezerTrackLink } from './deezerService';

// ─────────────────────────────────────────────
// Links of a track on each platform, asked to each platform's own API.
//
// Odesli (song.link) closed its keyless API on 2026-07-31 (every call answers
// 401 PUBLIC_API_ACCESS_DEPRECATED) and no longer issues keys. So:
// - Apple Music: iTunes Search, which also gives the cover;
// - Deezer: the track of the kept track's ISRC when it is known, an exact
//   recording (the pipeline acquires every track from its Deezer page and
//   writes that page's ISRC); else its public search, then that track's ISRC.
// ─────────────────────────────────────────────

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const TIMEOUT_MS = 5_000;
export const linksCache = new TtlCache<TrackLinks | null>(SEVEN_DAYS_MS);
export const itunesCache = new TtlCache<ItunesResult | null>(SEVEN_DAYS_MS);

export interface TrackLinks {
  platformLinks: PlatformLinks;
  /** Cover of the artist-verified iTunes candidate (600px). */
  artworkUrl?: string;
}

/** A lookup failed for a reason that may pass: the result must not be cached. */
class TransientError extends Error {}

async function getJson<T>(url: string, init: RequestInit = {}): Promise<T | null> {
  let response: Response;
  try {
    response = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (error) {
    throw new TransientError(error instanceof Error ? error.message : String(error));
  }
  if (response.status === 404) return null;
  if (!response.ok) throw new TransientError(`HTTP ${response.status}: ${url.split('?')[0]}`);
  try {
    return (await response.json()) as T;
  } catch {
    throw new TransientError(`invalid JSON: ${url.split('?')[0]}`);
  }
}

// ── Apple Music (iTunes Search) ──────────────

interface ItunesSearchResponse {
  results: Array<{
    trackViewUrl: string;
    trackName: string;
    artistName: string;
    artworkUrl100?: string;
  }>;
}

interface ItunesResult {
  trackViewUrl: string;
  artworkUrl: string | null;
  /** The pick also matches the queried title, not just the artist. */
  exactSong: boolean;
}

/**
 * The artist is the only reason to reject a candidate (another song of the
 * same artist still gives a fitting cover); the title picks among them and
 * decides whether the Apple Music link points to this very song.
 */
/** The cover of the artist-verified iTunes candidate (600 px), what a kept track shows. */
export async function findItunesCover(title: string, artist: string): Promise<string | null> {
  return (await searchItunes(title, artist))?.artworkUrl ?? null;
}

async function searchItunes(title: string, artist: string): Promise<ItunesResult | null> {
  const cacheKey = `${title.toLowerCase()}|${artist.toLowerCase()}`;
  const cached = itunesCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const query = encodeURIComponent(`${title} ${artist}`);
  const data = await getJson<ItunesSearchResponse>(
    `https://itunes.apple.com/search?term=${query}&media=music&entity=song&limit=3&country=FR`
  );
  const candidates = (data?.results ?? []).filter(
    (c) => c.trackViewUrl && artistMatch(artist, c.artistName)
  );
  if (candidates.length === 0) {
    itunesCache.set(cacheKey, null);
    return null;
  }
  const pick = candidates.reduce((best, c) =>
    similarity(title, c.trackName) > similarity(title, best.trackName) ? c : best
  );
  const result: ItunesResult = {
    trackViewUrl: pick.trackViewUrl,
    // Same CDN URL in 600px instead of the 100px thumbnail.
    artworkUrl: pick.artworkUrl100 ? pick.artworkUrl100.replace('100x100bb', '600x600bb') : null,
    exactSong: songMatch({ title, artist }, { title: pick.trackName, artist: pick.artistName }),
  };
  itunesCache.set(cacheKey, result);
  return result;
}

// ── Deezer ───────────────────────────────────

/** By the ISRC when it is known; the text search only when Deezer does not know it. */
async function findDeezer(
  title: string,
  artist: string,
  isrc: string | null
): Promise<DeezerTrackLink | null> {
  if (isrc) {
    const exact = await findTrackByIsrc(isrc);
    if (exact.status === 'failed') throw new TransientError('Deezer failed: /track/isrc');
    if (exact.status === 'found' && exact.value.link) return { link: exact.value.link, isrc };
  }
  const found = await searchTrack(title, artist);
  if (found.status === 'failed') throw new TransientError('Deezer failed: /search');
  return found.status === 'found' ? found.value : null;
}

// ── All of them ──────────────────────────────

async function settle<T>(
  label: string,
  lookup: Promise<T>,
  context: { title: string; artist: string }
): Promise<{ value: T | null; transient: boolean }> {
  try {
    return { value: await lookup, transient: false };
  } catch (error) {
    if (!(error instanceof TransientError)) throw error;
    logger.warn('track_links.lookup_failed', {
      platform: label,
      ...context,
      message: error.message,
    });
    return { value: null, transient: true };
  }
}

/**
 * The links and cover of a track. With its ISRC (the play's, stored on the
 * kept track), Deezer links that very recording. A complete answer
 * (found or not) is cached 7 days; one with a failed lookup is not, so the
 * next call retries it.
 */
export async function findTrackLinks(
  title: string,
  artist: string,
  isrc: string | null = null
): Promise<TrackLinks | null> {
  // The ISRC can come from a like's body: it joins the key instead of replacing
  // it, so one listener's ISRC never answers another title from the cache.
  const cacheKey = `${isrc ?? ''}|${title.toLowerCase()}|${artist.toLowerCase()}`;
  const cached = linksCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const context = { title, artist };
  const [itunes, deezer] = await Promise.all([
    settle('apple', searchItunes(title, artist), context),
    settle('deezer', findDeezer(title, artist, isrc), context),
  ]);

  const platformLinks: PlatformLinks = {};
  if (itunes.value?.exactSong) platformLinks.appleMusic = itunes.value.trackViewUrl;
  if (deezer.value) platformLinks.deezer = deezer.value.link;

  const result: TrackLinks | null =
    platformLinks.appleMusic || platformLinks.deezer || itunes.value?.artworkUrl
      ? {
          platformLinks,
          ...(itunes.value?.artworkUrl ? { artworkUrl: itunes.value.artworkUrl } : {}),
        }
      : null;

  if (!itunes.transient && !deezer.transient) {
    linksCache.set(cacheKey, result);
  }
  return result;
}
