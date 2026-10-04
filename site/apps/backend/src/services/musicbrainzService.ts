import type { ArtistFacts, ArtistLink, ArtistPlatform } from '@aubesonore/shared-types/client';
import { env } from '../config/env';
import { TtlCache } from '../lib/cache/ttlCache';
import { createSingleFlight } from '../lib/singleFlight';
import { logger } from '../lib/logger';

export interface MusicBrainzArtist {
  facts: ArtistFacts;
  links: ArtistLink[];
  /** The Wikidata item, the way to the artist's Wikipedia articles. */
  wikidataId: string | null;
  /** The Deezer artist the MusicBrainz page declares, when it declares exactly one. */
  deezerId: string | null;
}

export type Lookup<V> = { status: 'found'; value: V } | { status: 'none' } | { status: 'failed' };

const MUSICBRAINZ_API = 'https://musicbrainz.org/ws/2';
const TTL_MS = 7 * 24 * 60 * 60 * 1000;
const NEGATIVE_TTL_MS = 24 * 60 * 60 * 1000;
const TIMEOUT_MS = 5_000;
// MusicBrainz caps anonymous clients at one request per second and bans
// callers that ignore it. https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting
const MIN_INTERVAL_MS = 1_000;

const KINDS: Record<string, ArtistFacts['kind']> = {
  Person: 'person',
  Group: 'group',
  Orchestra: 'orchestra',
  Choir: 'choir',
};

// Listening platforms first, the official site last. Deezer is left out: the
// artist's own Deezer id is already known, exactly.
const LINK_ORDER: ArtistPlatform[] = [
  'spotify',
  'appleMusic',
  'bandcamp',
  'soundcloud',
  'official',
];

const LINK_HOSTS: Array<[string, ArtistPlatform]> = [
  ['open.spotify.com', 'spotify'],
  ['music.apple.com', 'appleMusic'],
  ['bandcamp.com', 'bandcamp'],
  ['soundcloud.com', 'soundcloud'],
];

export const musicbrainzCache = new TtlCache<Lookup<unknown>>(TTL_MS);
const flight = createSingleFlight<Lookup<unknown>>();
// The profile gives each source 6 s: a request queued longer would answer no
// one, and without a bound a burst of cold pages (a crawler) delays them all.
const MAX_QUEUE_MS = 3_000;
let nextSlotAt = 0;

/** The wait before this request's slot, or null when the queue is already full. */
function takeSlot(): number | null {
  const now = Date.now();
  const scheduledAt = Math.max(now, nextSlotAt);
  if (scheduledAt - now > MAX_QUEUE_MS) return null;
  nextSlotAt = scheduledAt + MIN_INTERVAL_MS;
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

/**
 * The MusicBrainz artist whose page declares this Deezer artist. Bound by that
 * link, never by name: homonyms are common (nine artists are called Cassius).
 */
export function findMbidByDeezerId(deezerId: string): Promise<Lookup<string>> {
  return cached(`deezer:${deezerId}`, async () => {
    const resource = `https://www.deezer.com/artist/${deezerId}`;
    const fetched = await fetchJson<{ relations?: Array<{ artist?: { id?: string } }> }>(
      `/url?resource=${encodeURIComponent(resource)}&inc=artist-rels&fmt=json`
    );
    if (fetched.status !== 'found') return fetched;

    const ids = new Set(
      (fetched.value.relations ?? []).flatMap((relation) =>
        relation.artist?.id ? [relation.artist.id] : []
      )
    );
    const [only] = ids;
    // Two artists sharing one Deezer page: none of them is the artist for sure.
    return ids.size === 1 && only ? { status: 'found', value: only } : { status: 'none' };
  });
}

interface RawIsrc {
  recordings?: Array<{ 'artist-credit'?: Array<{ artist?: { id?: string } }> }>;
}

/**
 * The artist credited first on the recordings MusicBrainz attaches to this
 * ISRC. An ISRC is the recording's own code: it binds a played track to its
 * artist without a name. Recordings that disagree on that artist (an ISRC
 * reused by mistake) bind none.
 */
export function findMbidByIsrc(isrc: string): Promise<Lookup<string>> {
  return cached(`isrc:${isrc}`, async () => {
    const fetched = await fetchJson<RawIsrc>(
      `/isrc/${encodeURIComponent(isrc)}?inc=artist-credits&fmt=json`
    );
    if (fetched.status !== 'found') return fetched;

    const ids = new Set(
      (fetched.value.recordings ?? []).flatMap((recording) => {
        const id = recording['artist-credit']?.[0]?.artist?.id;
        return id ? [id] : [];
      })
    );
    const [only] = ids;
    return ids.size === 1 && only ? { status: 'found', value: only } : { status: 'none' };
  });
}

interface RawArea {
  name?: string;
  'iso-3166-1-codes'?: string[];
  'iso-3166-3-codes'?: string[];
}

interface RawArtist {
  type?: string | null;
  area?: RawArea | null;
  'begin-area'?: RawArea | null;
  'life-span'?: { begin?: string | null; end?: string | null; ended?: boolean };
  relations?: Array<{ type?: string; ended?: boolean; url?: { resource?: string } }>;
}

function year(date: string | null | undefined): number | null {
  const parsed = date ? Number.parseInt(date.slice(0, 4), 10) : Number.NaN;
  return Number.isNaN(parsed) ? null : parsed;
}

function isCountry(area: RawArea | null | undefined): boolean {
  return (area?.['iso-3166-1-codes']?.length ?? 0) > 0;
}

// A dissolved country (the Soviet Union: SU, ISO 3166-3 SUHH) or a region
// MusicBrainz assigns itself (XW Worldwide, XE Europe) has no current name to
// localise, and Intl.DisplayNames reads SU as Russia.
function countryOf(area: RawArea | null | undefined): string | null {
  const code = area?.['iso-3166-1-codes']?.[0];
  if (!code || area?.['iso-3166-3-codes']?.length || code.startsWith('X')) return null;
  return code;
}

function toFacts(raw: RawArtist): ArtistFacts {
  const kind = KINDS[raw.type ?? ''] ?? null;
  // Only a group's life-span and begin area are a career. A person's are a
  // birth, and an artist without a type may be a person: their place is the
  // area they are identified with.
  const isGroup = kind !== null && kind !== 'person';
  const placeArea = isGroup ? raw['begin-area'] : raw.area;
  const place = placeArea?.name && !isCountry(placeArea) ? placeArea.name : null;
  return {
    kind,
    place,
    country: countryOf(raw.area) ?? (isGroup ? countryOf(raw['begin-area']) : null),
    formed: isGroup ? year(raw['life-span']?.begin) : null,
    ended: isGroup ? year(raw['life-span']?.end) : null,
    active: isGroup && raw['life-span']?.ended === false,
  };
}

function platformOf(url: URL, relationType: string): ArtistPlatform | null {
  if (relationType === 'official homepage') return 'official';
  const host = url.hostname;
  const entry = LINK_HOSTS.find(([suffix]) => host === suffix || host.endsWith(`.${suffix}`));
  return entry ? entry[1] : null;
}

/**
 * One link per platform and per address, https only. An ended relation is a
 * former address, whose domain may have been bought by someone else since.
 */
function toLinks(raw: RawArtist): ArtistLink[] {
  const links = new Map<ArtistPlatform, string>();
  for (const relation of raw.relations ?? []) {
    const resource = relation.url?.resource;
    if (relation.ended || !resource?.startsWith('https://')) continue;
    const platform = platformOf(new URL(resource), relation.type ?? '');
    if (platform && !links.has(platform)) links.set(platform, resource);
  }
  // In LINK_ORDER the official site comes last: when it is the Bandcamp page,
  // it is listed once, as Bandcamp.
  const listed = new Set<string>();
  return LINK_ORDER.flatMap((platform) => {
    const url = links.get(platform);
    if (!url || listed.has(url)) return [];
    listed.add(url);
    return [{ platform, url }];
  });
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

function wikidataIdOf(raw: RawArtist): string | null {
  const resource = raw.relations?.find((relation) => relation.type === 'wikidata')?.url?.resource;
  const id = resource?.split('/').pop();
  return id && /^Q\d+$/.test(id) ? id : null;
}

export function getArtistByMbid(mbid: string): Promise<Lookup<MusicBrainzArtist>> {
  return cached(`artist:${mbid}`, async () => {
    const fetched = await fetchJson<RawArtist>(
      `/artist/${encodeURIComponent(mbid)}?inc=url-rels&fmt=json`
    );
    if (fetched.status !== 'found') return fetched;
    return {
      status: 'found',
      value: {
        facts: toFacts(fetched.value),
        links: toLinks(fetched.value),
        wikidataId: wikidataIdOf(fetched.value),
        deezerId: deezerIdOf(fetched.value),
      },
    };
  });
}

/** Test seam: the throttle is module state and would slow every later test. */
export function __resetMusicbrainzThrottle(): void {
  nextSlotAt = 0;
}
