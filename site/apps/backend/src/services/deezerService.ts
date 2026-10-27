import { TtlCache } from '../lib/cache/ttlCache';
import type { Lookup } from '../lib/lookup';
import { createSingleFlight } from '../lib/singleFlight';
import { logger } from '../lib/logger';
import { songMatch } from '../lib/text/matchScore';

interface DeezerArtist {
  id: string;
  name: string;
}

const DEEZER_API = 'https://api.deezer.com';

/** An artist's page on Deezer, the address MusicBrainz relates to it. */
export function deezerArtistUrl(id: string): string {
  return `https://www.deezer.com/artist/${id}`;
}
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
}

function toArtist(raw: RawArtist): DeezerArtist | null {
  if (typeof raw.id !== 'number' || typeof raw.name !== 'string') return null;
  return { id: String(raw.id), name: raw.name };
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

interface RawTrack {
  title?: string;
  artist?: RawArtist;
}

const SEARCH_LIMIT = 10;

export interface DeezerIsrcTrack {
  title: string;
  /** The track's main artist, then its other contributors. */
  artists: DeezerArtist[];
  link: string | null;
  /** The album cover, hotlinked from Deezer's CDN. */
  cover: string | null;
}

interface RawIsrcTrack extends RawTrack {
  contributors?: RawArtist[];
  link?: string;
  album?: { cover_medium?: string };
}

/**
 * The Deezer track with this ISRC. `GET /track/isrc:<code>` is not in
 * Deezer's public documentation as far as could be read (its portal renders
 * nothing without JavaScript); its answers were measured on 2026-10-04. Like
 * MusicBrainz, it can answer another recording (« Lirik Banzay » for The
 * Pirouettes' « Un mec en or »): the resolver checks title and name.
 */
export async function findTrackByIsrc(isrc: string): Promise<Lookup<DeezerIsrcTrack>> {
  const key = `isrc:${isrc}`;
  const cached = deezerCache.get(key);
  if (cached !== undefined) return cached as Lookup<DeezerIsrcTrack>;

  return (await flight(key, async () => {
    const fetched = await getJson<RawIsrcTrack>(`/track/isrc:${encodeURIComponent(isrc)}`);
    if (fetched.status === 'failed') return { status: 'failed' };

    const body = fetched.status === 'ok' ? fetched.body : null;
    const artists = new Map<string, DeezerArtist>();
    for (const raw of [body?.artist, ...(body?.contributors ?? [])]) {
      const found = raw ? toArtist(raw) : null;
      if (found && !artists.has(found.id)) artists.set(found.id, found);
    }
    const result: Lookup<DeezerIsrcTrack> =
      body?.title && artists.size > 0
        ? {
            status: 'found',
            value: {
              title: body.title,
              artists: [...artists.values()],
              link: body.link ?? null,
              cover: body.album?.cover_medium ?? null,
            },
          }
        : { status: 'none' };
    deezerCache.set(key, result, result.status === 'none' ? NEGATIVE_TTL_MS : undefined);
    return result;
  })) as Lookup<DeezerIsrcTrack>;
}

export interface DeezerTrackLink {
  link: string;
  isrc: string | null;
}

interface RawSearchTrack {
  id?: number;
  title?: string;
  link?: string;
  artist?: RawArtist;
}

/**
 * A track on Deezer by its title and artist, for a kept track without an ISRC Deezer knows.
 * Deezer's advanced filter (`artist:"…"`) is broken: plain text, then the strict title and artist
 * match decides (songMatch); the track's own page then gives its ISRC.
 */
export async function searchTrack(title: string, artist: string): Promise<Lookup<DeezerTrackLink>> {
  const key = `track:${title.toLowerCase()}|${artist.toLowerCase()}`;
  const cached = deezerCache.get(key);
  if (cached !== undefined) return cached as Lookup<DeezerTrackLink>;

  return (await flight(key, async () => {
    const found = await getJson<{ data?: RawSearchTrack[] }>(
      `/search?q=${encodeURIComponent(`${artist} ${title}`)}&limit=${SEARCH_LIMIT}`
    );
    if (found.status === 'failed') return { status: 'failed' };
    const pick = (found.status === 'ok' ? (found.body.data ?? []) : []).find(
      (c) =>
        c.title !== undefined &&
        c.artist?.name !== undefined &&
        songMatch({ title, artist }, { title: c.title, artist: c.artist.name })
    );
    let result: Lookup<DeezerTrackLink> = { status: 'none' };
    if (pick?.id !== undefined && pick.link) {
      const track = await getJson<{ isrc?: string }>(`/track/${pick.id}`);
      if (track.status === 'failed') return { status: 'failed' };
      result = {
        status: 'found',
        value: { link: pick.link, isrc: track.status === 'ok' ? (track.body.isrc ?? null) : null },
      };
    }
    deezerCache.set(key, result, result.status === 'none' ? NEGATIVE_TTL_MS : undefined);
    return result;
  })) as Lookup<DeezerTrackLink>;
}

/** Test seam: the breaker is module state and would leak between test files. */
export function __resetDeezerCircuit(): void {
  circuitOpenUntil = 0;
}
