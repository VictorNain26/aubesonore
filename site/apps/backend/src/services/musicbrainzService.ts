import { env } from '../config/env';
import type { Lookup } from '../lib/lookup';
import { TtlCache } from '../lib/cache/ttlCache';
import { createSingleFlight } from '../lib/singleFlight';
import { logger } from '../lib/logger';

// MusicBrainz is asked live only to identify a played track (docs/vision.md
// §4.3); what the page says of an artist comes from the dump, via musilogy.
const MUSICBRAINZ_API = 'https://musicbrainz.org/ws/2';
const TTL_MS = 7 * 24 * 60 * 60 * 1000;
const NEGATIVE_TTL_MS = 24 * 60 * 60 * 1000;
const TIMEOUT_MS = 5_000;
// MusicBrainz caps anonymous clients at one request per second and bans
// callers that ignore it. https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting
const MIN_INTERVAL_MS = 1_000;
let intervalMs = MIN_INTERVAL_MS;

/**
 * A batch run beside the backend (`artists:resolve`, another process behind the same address)
 * takes every other second, so the two together stay within MusicBrainz's one request a second.
 */
export function shareRateWithBackend(): void {
  intervalMs = 2 * MIN_INTERVAL_MS;
}

export const musicbrainzCache = new TtlCache<Lookup<unknown>>(TTL_MS);
const flight = createSingleFlight<Lookup<unknown>>();
// The profile gives each source 6 s: a request queued longer would answer no
// one, and without a bound a burst of cold pages (a crawler) delays them all.
const MAX_QUEUE_MS = 3_000;
let nextSlotAt = 0;

/**
 * The wait before this request's slot, or null when the queue is already full. Timed on the
 * monotonic clock: the wall clock steps when the system sets its time (seen on WSL, 3 s back),
 * which would read as a full queue, or, stepping forward, let a burst past MusicBrainz's limit.
 */
function takeSlot(): number | null {
  const now = performance.now();
  const scheduledAt = Math.max(now, nextSlotAt);
  if (scheduledAt - now > MAX_QUEUE_MS) return null;
  nextSlotAt = scheduledAt + intervalMs;
  return scheduledAt - now;
}

/** A 404 is a definitive miss; any other failure is retried on the next call. */
async function fetchJson<T>(path: string): Promise<Lookup<T>> {
  const delay = takeSlot();
  if (delay === null) {
    logger.warn('musicbrainz.queue_full', { path });
    return { status: 'failed' };
  }
  if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));

  let response: Response;
  try {
    response = await fetch(`${MUSICBRAINZ_API}${path}`, {
      headers: { 'User-Agent': env.OUTBOUND_USER_AGENT },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    logger.warn('musicbrainz.network_error', { path, message: (err as Error).message });
    return { status: 'failed' };
  }

  if (response.status === 404) return { status: 'none' };
  if (!response.ok) {
    logger.warn('musicbrainz.upstream_error', { path, status: response.status });
    return { status: 'failed' };
  }
  return { status: 'found', value: (await response.json()) as T };
}

async function cached<V>(key: string, load: () => Promise<Lookup<V>>): Promise<Lookup<V>> {
  const hit = musicbrainzCache.get(key);
  if (hit !== undefined) return hit as Lookup<V>;

  return (await flight(key, async () => {
    const result = await load();
    if (result.status !== 'failed') {
      musicbrainzCache.set(key, result, result.status === 'none' ? NEGATIVE_TTL_MS : undefined);
    }
    return result;
  })) as Lookup<V>;
}

interface RawIsrc {
  recordings?: Array<{
    title?: string;
    'artist-credit'?: Array<{ name?: string; artist?: { id?: string; name?: string } }>;
  }>;
}

/** A recording an ISRC designates, with every artist credited on it. */
export interface IsrcRecording {
  title: string;
  /** Each credited artist: its MBID, the name it is credited as and its own name. */
  credits: Array<{ mbid: string; names: string[] }>;
}

/**
 * The recordings MusicBrainz attaches to an ISRC. The code alone does not
 * prove whose track was played: an ISRC can be filed on another recording
 * (Daniel Avery's « Illusion Of Time » under ANNA's « Dissolution »), so the
 * resolver checks title and credited name before trusting it.
 */
export function findRecordingsByIsrc(isrc: string): Promise<Lookup<IsrcRecording[]>> {
  return cached(`isrc:${isrc}`, async () => {
    const fetched = await fetchJson<RawIsrc>(
      `/isrc/${encodeURIComponent(isrc)}?inc=artist-credits&fmt=json`
    );
    return fetched.status === 'found' ? recordingsOf(fetched.value) : fetched;
  });
}

/** A quoted Lucene phrase: its backslashes and double quotes escaped. */
function phrase(text: string): string {
  return `"${text.replace(/[\\"]/g, '\\$&')}"`;
}

/**
 * The recordings MusicBrainz's search finds under a title credited to a name: the last way to the
 * MBID of an artist no ISRC identifies (Talulah Gosh, played without one). A
 * candidate only, like an ISRC's answer: the resolver keeps an artist credited under the played
 * name on a recording of the played title, and only when exactly one is. Measured on the 65
 * played artists without an MBID on 2026-10-12: 38 found exactly one, each checked by hand.
 * https://musicbrainz.org/doc/MusicBrainz_API/Search
 */
export function findRecordingsByTitle(
  name: string,
  title: string
): Promise<Lookup<IsrcRecording[]>> {
  return cached(`title:${name}\u0000${title}`, async () => {
    // 100, the most a page holds: a homonym ranked past the first page would go unseen.
    const query = `recording:${phrase(title)} AND artist:${phrase(name)}`;
    const fetched = await fetchJson<RawIsrc>(
      `/recording/?query=${encodeURIComponent(query)}&limit=100&fmt=json`
    );
    return fetched.status === 'found' ? recordingsOf(fetched.value) : fetched;
  });
}

function recordingsOf(raw: RawIsrc): Lookup<IsrcRecording[]> {
  const recordings = (raw.recordings ?? []).flatMap((recording) =>
    recording.title
      ? [
          {
            title: recording.title,
            credits: (recording['artist-credit'] ?? []).flatMap((credit) =>
              credit.artist?.id
                ? [
                    {
                      mbid: credit.artist.id,
                      names: [credit.name, credit.artist.name].filter((name): name is string =>
                        Boolean(name)
                      ),
                    },
                  ]
                : []
            ),
          },
        ]
      : []
  );
  return recordings.length > 0 ? { status: 'found', value: recordings } : { status: 'none' };
}

interface RawArtist {
  relations?: Array<{ type?: string; ended?: boolean; url?: { resource?: string } }>;
}

const DEEZER_ARTIST = /^https:\/\/www\.deezer\.com\/artist\/(\d+)$/;

function deezerIdOf(raw: RawArtist): string | null {
  const ids = new Set(
    (raw.relations ?? []).flatMap((relation) => {
      const match = relation.ended ? null : DEEZER_ARTIST.exec(relation.url?.resource ?? '');
      return match?.[1] ? [match[1]] : [];
    })
  );
  const [only] = ids;
  return ids.size === 1 && only ? only : null;
}

/** The Deezer artist the MusicBrainz page declares, when it declares exactly one. */
export function findDeezerIdByMbid(mbid: string): Promise<Lookup<string>> {
  return cached(`deezer-of:${mbid}`, async () => {
    const fetched = await fetchJson<RawArtist>(
      `/artist/${encodeURIComponent(mbid)}?inc=url-rels&fmt=json`
    );
    if (fetched.status !== 'found') return fetched;
    const deezerId = deezerIdOf(fetched.value);
    return deezerId ? { status: 'found', value: deezerId } : { status: 'none' };
  });
}

/** Test seam: the throttle is module state and would slow every later test. */
export function __resetMusicbrainzThrottle(): void {
  nextSlotAt = 0;
}
