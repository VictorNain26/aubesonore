import { TtlCache } from '../lib/cache/ttlCache';
import type { Lookup } from '../lib/lookup';
import { createSingleFlight } from '../lib/singleFlight';
import { logger } from '../lib/logger';

export interface DeezerArtist {
  id: string;
  name: string;
  picture: string | null;
}

const DEEZER_API = 'https://api.deezer.com';
const POSITIVE_TTL_MS = 24 * 60 * 60 * 1000;
const NEGATIVE_TTL_MS = 6 * 60 * 60 * 1000;
const CIRCUIT_OPEN_MS = 60 * 1000;
const TIMEOUT_MS = 5_000;
// Deezer answers its errors with HTTP 200 and an `error` body. 800 ("no data")
// is a definitive miss (measured: GET /artist/999999999999); any other error
// is treated as a failure, as deezer-python does (DeezerErrorResponse).
const DATA_NOT_FOUND = 800;

export const deezerCache = new TtlCache<unknown>(POSITIVE_TTL_MS);
const flight = createSingleFlight<unknown>();
let circuitOpenUntil = 0;

interface RawArtist {
  id?: number;
  name?: string;
  picture_xl?: string | null;
}

function toArtist(raw: RawArtist): DeezerArtist | null {
  if (typeof raw.id !== 'number' || typeof raw.name !== 'string') return null;
  return { id: String(raw.id), name: raw.name, picture: raw.picture_xl ?? null };
}

type Fetched<T> = { status: 'ok'; body: T } | { status: 'missing' } | { status: 'failed' };

async function getJson<T>(path: string): Promise<Fetched<T>> {
  if (Date.now() < circuitOpenUntil) return { status: 'failed' };

  let response: Response;
  try {
    response = await fetch(`${DEEZER_API}${path}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err) {
    logger.warn('deezer.network_error', { path, message: (err as Error).message });
    return { status: 'failed' };
  }

  if (response.status === 429) {
    circuitOpenUntil = Date.now() + CIRCUIT_OPEN_MS;
    logger.warn('deezer.circuit_open', { durationMs: CIRCUIT_OPEN_MS });
    return { status: 'failed' };
  }
  if (!response.ok) {
    logger.warn('deezer.upstream_error', { path, status: response.status });
    return { status: 'failed' };
  }

  const body = (await response.json()) as T & { error?: { code?: unknown } };
  if (body.error) {
    if (body.error.code === DATA_NOT_FOUND) return { status: 'missing' };
    logger.warn('deezer.error_body', { path, code: body.error.code });
    return { status: 'failed' };
  }
  return { status: 'ok', body };
}

export type ArtistSearch =
  | { status: 'match'; artist: DeezerArtist }
  | { status: 'none' }
  | { status: 'failed' };

interface RawTrack {
  title?: string;
  artist?: RawArtist;
}

const SEARCH_LIMIT = 10;

/** The artists named exactly `name`, once each. */
function namedExactly(
  raws: Array<RawArtist | undefined>,
  name: string,
  normalizeName: (value: string) => string
): DeezerArtist[] {
  const found = new Map<string, DeezerArtist>();
  for (const raw of raws) {
    const artist = raw ? toArtist(raw) : null;
    if (artist && normalizeName(artist.name) === normalizeName(name)) found.set(artist.id, artist);
  }
  return [...found.values()];
}

/**
 * The Deezer artist behind a track the antenna played. A name is not an
 * identity: of the 145 artists played by 2026-10-02, 47 shared their exact name
 * with another Deezer artist, and a name search ranked a homonym first for 11 of
 * them (Cassius, De La Soul, M.I.A., James…). The played title settles it; the
 * name alone binds only an artist with no homonym. A failure is reported as
 * such, never as "no match", so a Deezer outage cannot mark an artist unknown
 * for good.
 */
export async function searchArtist(
  name: string,
  title: string,
  normalizeName: (value: string) => string
): Promise<ArtistSearch> {
  const key = `search:${normalizeName(name)}:${normalizeName(title)}`;
  const cached = deezerCache.get(key);
  if (cached !== undefined) return cached as ArtistSearch;

  return (await flight(key, async () => {
    const tracks = await getJson<{ data?: RawTrack[] }>(
      `/search/track?limit=${SEARCH_LIMIT}&q=${encodeURIComponent(`${name} ${title}`)}`
    );
    if (tracks.status === 'failed') return { status: 'failed' };

    // Deezer titles carry versions the tags drop: "1999 (Radio Edit)".
    const played = normalizeName(title);
    const sameTitle = (value = '') =>
      normalizeName(value) === played || normalizeName(value).startsWith(`${played} `);
    let candidates = namedExactly(
      tracks.status === 'ok'
        ? (tracks.body.data ?? []).filter((t) => sameTitle(t.title)).map((t) => t.artist)
        : [],
      name,
      normalizeName
    );

    if (candidates.length !== 1) {
      const artists = await getJson<{ data?: RawArtist[] }>(
        `/search/artist?limit=${SEARCH_LIMIT}&q=${encodeURIComponent(name)}`
      );
      if (artists.status === 'failed') return { status: 'failed' };
      candidates = namedExactly(
        artists.status === 'ok' ? (artists.body.data ?? []) : [],
        name,
        normalizeName
      );
    }

    const [only] = candidates;
    const result: ArtistSearch =
      candidates.length === 1 && only ? { status: 'match', artist: only } : { status: 'none' };
    deezerCache.set(key, result, result.status === 'none' ? NEGATIVE_TTL_MS : undefined);
    return result;
  })) as ArtistSearch;
}

/**
 * The artist of the Deezer track with this ISRC. `GET /track/isrc:<code>` is
 * not in Deezer's public documentation as far as could be read (its portal
 * renders nothing without JavaScript); its answers were measured on
 * 2026-10-04. The resolver asks it only when MusicBrainz declares no Deezer
 * link for the artist.
 */
export async function findArtistByIsrc(isrc: string): Promise<ArtistSearch> {
  const key = `isrc:${isrc}`;
  const cached = deezerCache.get(key);
  if (cached !== undefined) return cached as ArtistSearch;

  return (await flight(key, async () => {
    const fetched = await getJson<RawTrack>(`/track/isrc:${encodeURIComponent(isrc)}`);
    if (fetched.status === 'failed') return { status: 'failed' };

    const artist =
      fetched.status === 'ok' && fetched.body.artist ? toArtist(fetched.body.artist) : null;
    const result: ArtistSearch = artist ? { status: 'match', artist } : { status: 'none' };
    deezerCache.set(key, result, artist ? undefined : NEGATIVE_TTL_MS);
    return result;
  })) as ArtistSearch;
}

export async function getArtist(id: string): Promise<Lookup<DeezerArtist>> {
  const key = `artist:${id}`;
  const cached = deezerCache.get(key);
  if (cached !== undefined) return cached as Lookup<DeezerArtist>;

  return (await flight(key, async () => {
    const fetched = await getJson<RawArtist>(`/artist/${encodeURIComponent(id)}`);
    if (fetched.status === 'failed') return { status: 'failed' };

    const artist = fetched.status === 'ok' ? toArtist(fetched.body) : null;
    const result: Lookup<DeezerArtist> = artist
      ? { status: 'found', value: artist }
      : { status: 'none' };
    deezerCache.set(key, result, artist ? undefined : NEGATIVE_TTL_MS);
    return result;
  })) as Lookup<DeezerArtist>;
}

/** Test seam: the breaker is module state and would leak between test files. */
export function __resetDeezerCircuit(): void {
  circuitOpenUntil = 0;
}
