import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { access, mkdir, readFile, rename, rm, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import sharp from 'sharp';
import { env } from '../config/env';
import { TtlCache } from '../lib/cache/ttlCache';
import { logger } from '../lib/logger';
import { createSingleFlight } from '../lib/singleFlight';

/**
 * The covers this site serves from its own domain, each made once and kept as a file nginx serves
 * straight from the `cover_store` volume (apps/frontend/nginx.conf, /covers/): a listener never
 * waits on the Cover Art Archive or on a resize again once a cover is stored. Three kinds:
 * - `caa/<release group>/<250|500|1200>.webp`: the Cover Art Archive's front cover of a record.
 *   250 and 500 come from one fetch of the archive's 500 px thumbnail; 1200 from its 1200 px one,
 *   the first time the large view opens. The legal page credits the archive (docs/vision.md §2.5).
 * - `station/<art id>/<96|192|384|768>.webp`: the antenna's art of a track, from our own AzuraCast,
 *   made when the track starts (antennaWatcher) so the hero never waits.
 * - `kept/<sha256>/<96|192|384|768>.webp`: the copies of that art kept tracks were given until a
 *   kept track's cover became its record's (keptTrackCovers.ts); none is made any more, those
 *   made stay served. Their original bytes stay in `originals/<sha256>`, out of nginx's reach, so
 *   any size can be made again.
 * WebP at quality 80, never enlarged: 250 + 500 weigh about 37 KB a record (measured 2026-10-27).
 * A cover taken down on request is on the block list (coverBlocklist.txt): never served, fetched
 * nor stored again, its files removed at boot.
 */

export const CAA_SIZES = [250, 500, 1200] as const;
export const STATION_SIZES = [96, 192, 384, 768] as const;

type CaaSize = (typeof CAA_SIZES)[number];
type StationSize = (typeof STATION_SIZES)[number];

export type CoverKey =
  | { kind: 'caa'; id: string; size: CaaSize }
  | { kind: 'station' | 'kept'; id: string; size: StationSize };

const RELEASE_GROUP = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const STATION_ART_ID = /^[0-9a-f]+-[0-9]+$/;
const SHA256 = /^[0-9a-f]{64}$/;
const FILE = /^([1-9][0-9]*)\.webp$/;

const ID_OF: Record<CoverKey['kind'], RegExp> = {
  caa: RELEASE_GROUP,
  station: STATION_ART_ID,
  kept: SHA256,
};

function isCover(kind: string, id: string): kind is CoverKey['kind'] {
  return Object.hasOwn(ID_OF, kind) && ID_OF[kind as CoverKey['kind']].test(id);
}

/** The cover an address names, or null for anything but one of the store's own keys. */
export function parseCoverKey(kind: string, id: string, file: string): CoverKey | null {
  if (!isCover(kind, id)) return null;
  const size = Number(FILE.exec(file)?.[1]);
  if (kind === 'caa')
    return CAA_SIZES.includes(size as CaaSize) ? { kind, id, size: size as CaaSize } : null;
  return STATION_SIZES.includes(size as StationSize)
    ? { kind, id, size: size as StationSize }
    : null;
}

// `<kind> <id>  # who asked, and when`: the comment is required.
const BLOCKLIST_LINE = /^(\S+)\s+(\S+)\s+#\s*\S.*$/;

/**
 * The covers taken down on request, as `<kind>/<id>`. A line that is not a cover of the store
 * with its comment throws, naming the line: the boot stops rather than serve a cover by mistake.
 */
export function parseCoverBlocklist(text: string): Set<string> {
  const blocked = new Set<string>();
  text.split('\n').forEach((raw, index) => {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) return;
    const [, kind = '', id = ''] = BLOCKLIST_LINE.exec(line) ?? [];
    if (!isCover(kind, id))
      throw new Error(`coverBlocklist.txt line ${index + 1}: expected "<kind> <id>  # who, when"`);
    blocked.add(`${kind}/${id}`);
  });
  return blocked;
}

/** The committed block list, read once at boot. */
export function readCoverBlocklist(): Set<string> {
  return parseCoverBlocklist(readFileSync(join(import.meta.dir, 'coverBlocklist.txt'), 'utf8'));
}

/** A cover, or why there is none: `missing` upstream (kept in mind a day), or `failed` for now. */
export type Made = Buffer | 'missing' | 'failed';

export type FillOutcome = 'present' | 'known-missing' | 'stored' | 'missing' | 'failed' | 'blocked';

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

export interface CoverStoreOptions {
  /** The volume's mount point. */
  root: string;
  fetch?: Fetch;
  /** The Cover Art Archive is MusicBrainz's: a User-Agent with a contact, like every call there. */
  userAgent: string;
  azuracastBaseUrl: string;
  stationId: string;
  /** The site's origin, which a kept track's cover is addressed from. */
  publicBaseUrl: string;
  /** Covers taken down on request, as `<kind>/<id>` (parseCoverBlocklist). */
  blocked?: ReadonlySet<string>;
}

// The archive's redirects only, over https: never a host this server's network reaches.
const ARCHIVE_HOST = /^https:\/\/(([a-z0-9-]+\.)*archive\.org|coverartarchive\.org)\//;
const MAX_REDIRECTS = 5;
// A slow archive.org node gives way to the retry well before Cloudflare's 100 s.
const FETCH_TIMEOUT_MS = 15_000;
const MAX_UPSTREAM_BYTES = 10 * 1024 * 1024;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MISSING_FOR_MS = 24 * 60 * 60 * 1000;
const WEBP_QUALITY = 80;

export function createCoverStore(options: CoverStoreOptions) {
  const { root, userAgent, azuracastBaseUrl, stationId, publicBaseUrl } = options;
  const blocked = options.blocked ?? new Set<string>();
  const isBlocked = (kind: CoverKey['kind'], id: string) => blocked.has(`${kind}/${id}`);
  // Read at call time: tests stub the global.
  const fetchImpl: Fetch = options.fetch ?? ((input, init) => fetch(input, init));
  const missing = new TtlCache<true>(MISSING_FOR_MS);
  // A flight hands every size it made to each caller, who takes its own: callers asking for
  // different sizes of one source share it.
  const flight = createSingleFlight<Map<number, Buffer> | 'missing' | 'failed'>();

  const fileOf = (key: CoverKey) => join(root, 'covers', key.kind, key.id, `${key.size}.webp`);
  const originalOf = (sha: string) => join(root, 'originals', sha);

  async function exists(path: string): Promise<boolean> {
    try {
      await access(path);
      return true;
    } catch {
      return false;
    }
  }

  /** Written whole or not at all: nginx never serves half a file. */
  async function writeWhole(path: string, bytes: Buffer): Promise<void> {
    await mkdir(dirname(path), { recursive: true, mode: 0o755 });
    const temporary = `${path}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, bytes, { mode: 0o644 });
      await rename(temporary, path);
    } catch (error) {
      await rm(temporary, { force: true });
      throw error;
    }
  }

  function toWebp(image: Buffer, size: number): Promise<Buffer> {
    return sharp(image)
      .resize(size, size, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer();
  }

  /** Each size made from one image and written, handed back by size. */
  async function store(
    image: Buffer,
    sizes: readonly number[],
    keyOf: (size: number) => CoverKey
  ): Promise<Map<number, Buffer>> {
    const made = await Promise.all(sizes.map((size) => toWebp(image, size)));
    await Promise.all(sizes.map((size, i) => writeWhole(fileOf(keyOf(size)), made[i]!)));
    return new Map(sizes.map((size, i) => [size, made[i]!]));
  }

  /** The size a caller asked for, out of what its flight made. */
  async function pick(
    made: Promise<Map<number, Buffer> | 'missing' | 'failed'>,
    wanted: number
  ): Promise<Made> {
    const sizes = await made;
    return typeof sizes === 'string' ? sizes : (sizes.get(wanted) ?? 'failed');
  }

  async function readImage(response: Response, limit: number): Promise<Buffer | null> {
    const type = response.headers.get('content-type')?.split(';')[0]?.trim() ?? '';
    if (!IMAGE_TYPES.has(type)) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    return bytes.length > 0 && bytes.length <= limit ? bytes : null;
  }

  /** The archive's image, following its redirects (coverartarchive.org, archive.org, a node). */
  async function fetchArchiveOnce(start: string): Promise<Buffer | 'missing' | 'failed'> {
    let url = start;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      // Nothing of the listener reaches the archive: no cookie, no address, no language.
      const response = await fetchImpl(url, {
        redirect: 'manual',
        headers: { 'user-agent': userAgent, accept: 'image/jpeg,image/*' },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (response.status >= 300 && response.status < 400) {
        const next = new URL(response.headers.get('location') ?? '', url).href;
        if (!ARCHIVE_HOST.test(next)) {
          logger.warn('coverStore.redirect_refused', { from: url, to: next });
          return 'failed';
        }
        url = next;
        continue;
      }
      if (response.status === 404) return 'missing';
      if (response.status !== 200) return 'failed';
      return (await readImage(response, MAX_UPSTREAM_BYTES)) ?? 'failed';
    }
    return 'failed';
  }

  /** archive.org failing (a node, at random): asked once more, from the start, then given up on. */
  async function fetchArchive(url: string): Promise<Buffer | 'missing' | 'failed'> {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const answer = await fetchArchiveOnce(url);
        if (answer !== 'failed') return answer;
      } catch (error) {
        logger.warn('coverStore.archive_failed', { url, message: (error as Error).message });
      }
    }
    return 'failed';
  }

  /** Our own AzuraCast's art: a redirect is its generic image, which is no cover. */
  async function fetchStationArt(path: string): Promise<Buffer | 'missing' | 'failed'> {
    try {
      const response = await fetchImpl(`${azuracastBaseUrl}${path}`, {
        redirect: 'manual',
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if ((response.status >= 300 && response.status < 400) || response.status === 404)
        return 'missing';
      if (response.status !== 200) return 'failed';
      return (await readImage(response, MAX_UPSTREAM_BYTES)) ?? 'failed';
    } catch (error) {
      logger.warn('coverStore.station_failed', { path, message: (error as Error).message });
      return 'failed';
    }
  }

  /** One upstream image made into sizes, once per source however many listeners ask. */
  function make(
    source: string,
    fetchSource: () => Promise<Buffer | 'missing' | 'failed'>,
    sizes: readonly number[],
    keyOf: (size: number) => CoverKey,
    wanted: number
  ): Promise<Made> {
    if (missing.get(source)) return Promise.resolve('missing');
    const made = flight(source, async () => {
      const image = await fetchSource();
      if (image === 'missing') missing.set(source, true);
      if (!Buffer.isBuffer(image)) return image;
      try {
        return await store(image, sizes, keyOf);
      } catch (error) {
        logger.warn('coverStore.not_made', { source, message: (error as Error).message });
        return 'failed';
      }
    });
    return pick(made, wanted);
  }

  function makeCover(key: CoverKey): Promise<Made> {
    if (key.kind === 'caa') {
      // 250 is made from the 500 px thumbnail: one fetch for both.
      const thumb = key.size === 1200 ? 1200 : 500;
      const sizes = key.size === 1200 ? [1200] : [500, 250];
      return make(
        `caa/${key.id}/${thumb}`,
        () => fetchArchive(`https://coverartarchive.org/release-group/${key.id}/front-${thumb}`),
        sizes,
        (size) => ({ kind: 'caa', id: key.id, size: size as CaaSize }),
        key.size
      );
    }
    if (key.kind === 'station') {
      return make(
        `station/${key.id}`,
        () => fetchStationArt(`/api/station/${stationId}/art/${key.id}.jpg`),
        STATION_SIZES,
        (size) => ({ kind: 'station', id: key.id, size: size as StationSize }),
        key.size
      );
    }
    const made = flight(`kept/${key.id}/${key.size}`, async () => {
      let original: Buffer;
      try {
        original = await readFile(originalOf(key.id));
      } catch {
        return 'missing';
      }
      try {
        return await store(original, [key.size], () => key);
      } catch (error) {
        logger.warn('coverStore.not_made', { kept: key.id, message: (error as Error).message });
        return 'failed';
      }
    });
    return pick(made, key.size);
  }

  return {
    /** Forgets the covers known missing once their day is over. */
    missing,

    /** The stored file, else the cover made, written and handed back. */
    async get(key: CoverKey): Promise<Made> {
      if (isBlocked(key.kind, key.id)) return 'missing';
      try {
        return await readFile(fileOf(key));
      } catch {
        return makeCover(key);
      }
    },

    /** A record's 250 and 500, ahead of the page that shows them (coverFill). */
    async fillReleaseGroup(id: string): Promise<FillOutcome> {
      if (isBlocked('caa', id)) return 'blocked';
      const small = { kind: 'caa', id, size: 250 } as const;
      if ((await exists(fileOf(small))) && (await exists(fileOf({ ...small, size: 500 }))))
        return 'present';
      if (missing.get(`caa/${id}/500`)) return 'known-missing';
      const made = await makeCover(small);
      return Buffer.isBuffer(made) ? 'stored' : made;
    },

    /** The antenna's new track: its four sizes made before a listener asks. */
    async prepareStation(artId: string): Promise<void> {
      if (!STATION_ART_ID.test(artId) || isBlocked('station', artId)) return;
      const key = { kind: 'station', id: artId, size: 768 } as const;
      if (!(await exists(fileOf(key)))) await makeCover(key);
    },

    /**
     * Deletes the blocked covers' files, a kept one's original with them; run at boot, as often
     * as it likes. nginx serves the volume, so a file gone is a cover it no longer serves. How
     * many covers had files.
     */
    async removeBlocked(): Promise<number> {
      let removed = 0;
      for (const entry of blocked) {
        const [kind, id] = entry.split('/') as [CoverKey['kind'], string];
        const paths = [join(root, 'covers', kind, id)];
        if (kind === 'kept') paths.push(originalOf(id));
        const present = (await Promise.all(paths.map(exists))).some(Boolean);
        await Promise.all(paths.map((path) => rm(path, { recursive: true, force: true })));
        if (present) removed++;
      }
      return removed;
    },

    keptUrl(sha: string): string {
      return `${publicBaseUrl}/covers/kept/${sha}/768.webp`;
    },

    /**
     * Writes a kept original unless the same bytes are there, then reads it back: true only once
     * the file holds exactly those bytes (keptCovers, moving the covers table).
     */
    async keepOriginal(sha: string, bytes: Buffer): Promise<boolean> {
      if (!SHA256.test(sha)) return false;
      const path = originalOf(sha);
      const holds = async () => {
        try {
          return (await readFile(path)).equals(bytes);
        } catch {
          return false;
        }
      };
      if (!(await holds())) await writeWhole(path, bytes);
      return holds();
    },
  };
}

export type CoverStore = ReturnType<typeof createCoverStore>;

export const coverStore = createCoverStore({
  root: env.COVER_STORE_DIR,
  userAgent: env.OUTBOUND_USER_AGENT,
  azuracastBaseUrl: env.AZURACAST_BASE_URL,
  stationId: env.AZURACAST_STATION_ID,
  publicBaseUrl: env.FRONTEND_BASE_URL,
  blocked: readCoverBlocklist(),
});
