import { env } from '../config/env';
import type { PlatformLinks } from '../db/schema';
import { TtlCache } from '../lib/cache/ttlCache';
import { logger } from '../lib/logger';
import { similarity, artistMatch, songMatch } from '../lib/text/matchScore';

// ─────────────────────────────────────────────
// Links of a track on each platform, asked to each platform's own API.
//
// Odesli (song.link) closed its keyless API on 2026-07-31 (every call answers
// 401 PUBLIC_API_ACCESS_DEPRECATED) and no longer issues keys. So:
// - Apple Music: iTunes Search, which also gives the cover;
// - Deezer: the track of the kept track's ISRC when it is known, an exact
//   recording (the pipeline acquires every track from its Deezer page and
//   writes that page's ISRC); else its public search, then that track's ISRC;
// - Spotify: search by the ISRC (an exact recording match), with the app's
//   client credentials. Since February 2026 a development-mode app answers 403
//   unless its owner holds Premium: that is logged and retried, never cached;
// - every other platform: the song.link landing page, which resolves itself.
// ─────────────────────────────────────────────

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const TIMEOUT_MS = 5_000;
export const linksCache = new TtlCache<TrackLinks | null>(SEVEN_DAYS_MS);
export const itunesCache = new TtlCache<ItunesResult | null>(SEVEN_DAYS_MS);

export interface TrackLinks {
  /** song.link landing page for the platforms without a link of their own. */
  songlinkUrl?: string;
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

interface DeezerSearchResponse {
  data: Array<{ id: number; title: string; link: string; artist: { name: string } }>;
}

// Deezer answers an unknown ISRC with HTTP 200 and the error body
// {"error":{"code":800,"message":"no data"}} (measured on /track/isrc:): a
// definitive miss. Any other error code is a failure, as in deezerService.
const DEEZER_NO_DATA = 800;

type DeezerBody = { error?: { code?: unknown } } | null;

/** True for Deezer's "no data"; throws on any other error body, so a quota is never cached. */
function deezerMiss(data: DeezerBody, path: string): boolean {
  if (!data?.error) return false;
  if (data.error.code === DEEZER_NO_DATA) return true;
  throw new TransientError(`Deezer error ${String(data.error.code)}: ${path}`);
}

/** The Deezer track of this very recording, or null when Deezer does not know the ISRC. */
async function deezerByIsrc(isrc: string): Promise<{ link: string; isrc: string } | null> {
  const data = await getJson<{ link?: string; error?: { code?: unknown } }>(
    `https://api.deezer.com/track/isrc:${encodeURIComponent(isrc)}`
  );
  if (deezerMiss(data, '/track/isrc')) return null;
  return data?.link ? { link: data.link, isrc } : null;
}

/** By the ISRC when it is known; the text search only when Deezer does not know it. */
async function findDeezer(
  title: string,
  artist: string,
  isrc: string | null
): Promise<{ link: string; isrc: string | null } | null> {
  const exact = isrc ? await deezerByIsrc(isrc) : null;
  return exact ?? searchDeezer(title, artist);
}

/**
 * Deezer's advanced filter (`artist:"…"`) is broken: plain text, then the
 * strict title and artist match decides.
 */
export async function searchDeezer(
  title: string,
  artist: string
): Promise<{ link: string; isrc: string | null } | null> {
  const query = encodeURIComponent(`${artist} ${title}`);
  const data = await getJson<Partial<DeezerSearchResponse> & { error?: { code?: unknown } }>(
    `https://api.deezer.com/search?q=${query}&limit=10`
  );
  if (deezerMiss(data, '/search')) return null;
  const pick = (data?.data ?? []).find((c) =>
    songMatch({ title, artist }, { title: c.title, artist: c.artist.name })
  );
  if (!pick) return null;
  const track = await getJson<{ isrc?: string; error?: { code?: unknown } }>(
    `https://api.deezer.com/track/${pick.id}`
  );
  const known = !deezerMiss(track, '/track');
  return { link: pick.link, isrc: (known && track?.isrc) || null };
}

// ── Spotify ──────────────────────────────────

let spotifyToken: { value: string; expiresAt: number } | null = null;

async function spotifyAccessToken(id: string, secret: string): Promise<string> {
  if (spotifyToken && spotifyToken.expiresAt > Date.now()) return spotifyToken.value;
  const data = await getJson<{ access_token: string; expires_in: number }>(
    'https://accounts.spotify.com/api/token',
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(`${id}:${secret}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    }
  );
  if (!data) throw new TransientError('Spotify token: 404');
  // Renewed a minute early, so a request never carries a token about to expire.
  spotifyToken = {
    value: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  };
  return data.access_token;
}

async function searchSpotifyByIsrc(isrc: string): Promise<string | null> {
  if (!env.SPOTIFY_CLIENT_ID || !env.SPOTIFY_CLIENT_SECRET) return null;
  const token = await spotifyAccessToken(env.SPOTIFY_CLIENT_ID, env.SPOTIFY_CLIENT_SECRET);
  const data = await getJson<{
    tracks?: { items: Array<{ external_urls: { spotify?: string } }> };
  }>(
    `https://api.spotify.com/v1/search?type=track&limit=1&market=FR&q=${encodeURIComponent(`isrc:${isrc}`)}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return data?.tracks?.items[0]?.external_urls.spotify ?? null;
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
 * kept track), Deezer and Spotify link that very recording. A complete answer
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
  const recording = isrc ?? deezer.value?.isrc;
  const spotify = recording
    ? await settle('spotify', searchSpotifyByIsrc(recording), context)
    : { value: null, transient: false };

  const platformLinks: PlatformLinks = {};
  if (spotify.value) platformLinks.spotify = spotify.value;
  if (itunes.value?.exactSong) platformLinks.appleMusic = itunes.value.trackViewUrl;
  if (deezer.value) platformLinks.deezer = deezer.value.link;

  const anchor = deezer.value?.link ?? platformLinks.spotify ?? platformLinks.appleMusic;
  const result: TrackLinks | null =
    anchor || itunes.value?.artworkUrl
      ? {
          platformLinks,
          ...(anchor ? { songlinkUrl: `https://song.link/${anchor}` } : {}),
          ...(itunes.value?.artworkUrl ? { artworkUrl: itunes.value.artworkUrl } : {}),
        }
      : null;

  if (!itunes.transient && !deezer.transient && !spotify.transient) {
    linksCache.set(cacheKey, result);
  }
  return result;
}
