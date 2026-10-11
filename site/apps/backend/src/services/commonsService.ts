import type { ArtistPhoto } from '@aubesonore/shared-types/client';
import { env } from '../config/env';
import { TtlCache } from '../lib/cache/ttlCache';
import { createSingleFlight } from '../lib/singleFlight';
import { logger } from '../lib/logger';
import type { Lookup } from '../lib/lookup';

const TTL_MS = 7 * 24 * 60 * 60 * 1000;
const NEGATIVE_TTL_MS = 24 * 60 * 60 * 1000;
const TIMEOUT_MS = 5_000;
// A standard thumbnail width: Wikimedia serves no other to a hotlink
// (mediawiki.org/wiki/Common_thumbnail_sizes); the page picks a smaller one by srcset.
const WIDTH = 1280;

export const commonsCache = new TtlCache<ArtistPhoto | null>(TTL_MS);
const flight = createSingleFlight<ArtistPhoto | null | 'failed'>();

// Wikimedia blocks scripts without a contact in their User-Agent.
// https://foundation.wikimedia.org/wiki/Policy:Wikimedia_Foundation_User-Agent_Policy
async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: { 'User-Agent': env.OUTBOUND_USER_AGENT },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return (await response.json()) as T;
}

interface Statement {
  rank?: string;
  mainsnak?: { datavalue?: { value?: unknown } };
}

/** The item's image (P18): the preferred statement, else the first that is not deprecated. */
async function imageFile(wikidataId: string): Promise<string | null> {
  const body = await getJson<{ claims?: { P18?: Statement[] } }>(
    `https://www.wikidata.org/w/api.php?action=wbgetclaims&entity=${wikidataId}` +
      '&property=P18&format=json'
  );
  const statements = (body.claims?.P18 ?? []).filter((s) => s.rank !== 'deprecated');
  const chosen = statements.find((s) => s.rank === 'preferred') ?? statements[0];
  const value = chosen?.mainsnak?.datavalue?.value;
  return typeof value === 'string' ? value : null;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" };

/** Commons gives the author as HTML (a link to a user page, a Flickr profile): its text. */
export function plainText(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&(amp|lt|gt|quot|#39);/g, (_, entity: string) => ENTITIES[entity] ?? '')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/\s+/g, ' ')
    .trim();
}

interface ImageInfo {
  thumburl?: string;
  descriptionurl?: string;
  extmetadata?: Record<string, { value?: string } | undefined>;
}

async function describe(file: string): Promise<ArtistPhoto | null> {
  const body = await getJson<{ query?: { pages?: { imageinfo?: ImageInfo[] }[] } }>(
    'https://commons.wikimedia.org/w/api.php?action=query&format=json&formatversion=2' +
      `&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=${WIDTH}` +
      '&iiextmetadatafilter=Artist|LicenseShortName|LicenseUrl' +
      `&titles=${encodeURIComponent(`File:${file}`)}`
  );
  const info = body.query?.pages?.[0]?.imageinfo?.[0];
  const licence = info?.extmetadata?.LicenseShortName?.value;
  // Without its licence, the photo cannot be credited as Commons asks: no photo.
  if (!info?.thumburl || !info.descriptionurl || !licence) return null;
  const author = plainText(info.extmetadata?.Artist?.value ?? '');
  return {
    url: info.thumburl,
    credit: {
      author: author || null,
      licence: plainText(licence),
      licenceUrl: info.extmetadata?.LicenseUrl?.value ?? null,
      source: info.descriptionurl,
    },
  };
}

/**
 * The photo of the artist's Wikidata item on Wikimedia Commons, with what its
 * licence asks to credit (docs/vision.md §2.5). A failure is never cached as
 * "no photo".
 */
export async function getPhoto(wikidataId: string): Promise<Lookup<ArtistPhoto>> {
  const cached = commonsCache.get(wikidataId);
  if (cached !== undefined) return cached ? { status: 'found', value: cached } : { status: 'none' };

  const result = await flight(wikidataId, async () => {
    try {
      const file = await imageFile(wikidataId);
      const photo = file ? await describe(file) : null;
      commonsCache.set(wikidataId, photo, photo ? undefined : NEGATIVE_TTL_MS);
      return photo;
    } catch (err) {
      logger.warn('commons.fetch_failed', { wikidataId, message: (err as Error).message });
      return 'failed';
    }
  });
  if (result === 'failed') return { status: 'failed' };
  return result ? { status: 'found', value: result } : { status: 'none' };
}
