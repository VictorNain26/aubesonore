import type { ArtistPageRef, ArtistProfile } from '@aubesonore/shared-types/client';
import { getLocale, localizeHref, type Locale } from '@/paraglide/runtime.js';
import { getJson, HttpError, readKnown } from './api';

const SLUG = '__slug__';
const pathTemplates = new Map<string, string>();

/** The page path of an artist, in the current language (`/artiste/…` or `/en/artist/…`). */
export function artistPath(page: { slug: string }): string {
  // localizeHref compiles URLPatterns on every call, which showed in the profile of a list of
  // ninety artists: the path is localized once per language, the slug filled in after.
  const locale = getLocale();
  let template = pathTemplates.get(locale);
  if (template === undefined) {
    template = localizeHref(`/artiste/${SLUG}`);
    pathTemplates.set(locale, template);
  }
  const slug = encodeURIComponent(page.slug);
  return template.replace(SLUG, () => slug);
}

/** The profile in the page language: its summary is the Wikipedia article in that language. */
export async function fetchArtistProfile(
  slug: string,
  locale: Locale,
  signal?: AbortSignal
): Promise<ArtistProfile | null> {
  return readKnown<ArtistProfile>(
    `/api/artist/page/${encodeURIComponent(slug)}?lang=${locale}`,
    signal
  );
}

// One request per name however many parts of the page ask for it (the hero and the player bar
// show the same artist), and a page once found is kept for the visit: /api/artist/resolve allows
// 10 calls a minute per address, which listeners behind one address (a carrier's NAT, an office)
// share. A name without a page yet, or refused (the limit reached), is no page for MISS_KEPT_MS,
// then asked again: an artist heard for the first time gets its page a little after its first
// play, and a refusal is never asked again in a loop.
const resolving = new Map<string, { request: Promise<ArtistPageRef | null>; until: number }>();

/** How long a name without a page is held as none before it is asked again. */
export const MISS_KEPT_MS = 5 * 60_000;

/**
 * The page of an artist heard on the antenna, from the raw AzuraCast string.
 * `null` when the artist has no page (yet): callers show no link then.
 */
export function resolveArtistPage(name: string): Promise<ArtistPageRef | null> {
  const trimmed = name.trim();
  if (!trimmed) return Promise.resolve(null);
  const known = resolving.get(trimmed);
  if (known && Date.now() < known.until) return known.request;

  // Any failed answer is no page; a request that never answers is asked again.
  const request = getJson<ArtistPageRef>(
    `/api/artist/resolve?name=${encodeURIComponent(trimmed)}`
  ).catch((err: unknown) => {
    if (err instanceof HttpError) return null;
    throw err;
  });
  const entry = { request, until: Infinity };
  resolving.set(trimmed, entry);
  void request.then(
    (page) => {
      if (!page) entry.until = Date.now() + MISS_KEPT_MS;
    },
    () => {
      if (resolving.get(trimmed) === entry) resolving.delete(trimmed);
    }
  );
  return request;
}
