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

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

/** A character reference's character; nothing for a code point Unicode does not have. */
function character(code: number): string {
  return Number.isInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
}

/**
 * Commons gives the author as HTML (a link to a user page, a Flickr profile):
 * its text, read by an HTML parser (Bun's HTMLRewriter) rather than by
 * stripping tags, then its character references decoded. The page shows it as
 * text, never as markup.
 */
export async function plainText(html: string): Promise<string> {
  const parts: string[] = [];
  await new HTMLRewriter()
    .onDocument({
      text(chunk) {
        parts.push(chunk.text);
      },
    })
    .transform(new Response(html))
    .text();
  return parts
    .join('')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => character(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal: string) => character(Number(decimal)))
    .replace(/&([a-z]+);/gi, (entity: string, name: string) => ENTITIES[name] ?? entity)
    .replace(/\s+/g, ' ')
    .trim();
}

/** An address the API gave, kept only when it is https on one of `hosts`. */
function httpsOn(url: string | undefined, hosts: readonly string[]): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && hosts.includes(parsed.hostname) ? parsed.href : null;
  } catch {
    return null;
  }
}

const IMAGE_HOSTS = ['upload.wikimedia.org', 'thumb.wikimedia.org'];
const PAGE_HOSTS = ['commons.wikimedia.org'];

// The licence's address comes from the file's page, which anyone can edit: a
// link is kept only to the licences' own sites, else the licence stays words.
const LICENCE_HOSTS = ['creativecommons.org', 'www.gnu.org'];

function licenceLink(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url.startsWith('//') ? `https:${url}` : url);
    return parsed.protocol === 'https:' && LICENCE_HOSTS.includes(parsed.hostname)
      ? parsed.href
      : null;
  } catch {
    return null;
  }
}

interface ImageInfo {
  thumburl?: string;
  thumbwidth?: number;
  thumbheight?: number;
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
  // The page links and shows these: https on Wikimedia's own hosts, or no photo.
  const url = httpsOn(info?.thumburl, IMAGE_HOSTS);
  const source = httpsOn(info?.descriptionurl, PAGE_HOSTS);
  // Without its licence, the photo cannot be credited as Commons asks: no photo.
  if (!info || !url || !source || !licence) return null;
  const author = await plainText(info.extmetadata?.Artist?.value ?? '');
  return {
    url,
    width: info.thumbwidth ?? null,
    height: info.thumbheight ?? null,
    credit: {
      author: author || null,
      licence: await plainText(licence),
      licenceUrl: licenceLink(info.extmetadata?.LicenseUrl?.value),
      source,
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
