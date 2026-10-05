import type { ArtistProfile } from '@aubesonore/shared-types/client';
import { object, record, safeParse, string } from 'valibot';
import { getLocale, localizeHref } from '@/paraglide/runtime.js';
import { API_BASE_URL } from '../utils/config';

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
  signal?: AbortSignal
): Promise<ArtistProfile | null> {
  const response = await fetch(
    `${API_BASE_URL}/api/artist/page/${encodeURIComponent(slug)}?lang=${getLocale()}`,
    { signal: signal ?? null }
  );
  // 400: a malformed id, from a truncated link — as unknown as a 404.
  if (response.status === 404 || response.status === 400) return null;
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return (await response.json()) as ArtistProfile;
}

// One request per name however many parts of the page ask for it (the hero and the player bar
// show the same artist), and a page once found is kept for the visit: /api/artist/resolve allows
// 10 calls a minute per address, which listeners behind one address (a carrier's NAT, an office)
// share. A name without a page yet is asked again later: an artist heard for the first time gets
// its page a little after its first play.
const resolving = new Map<string, Promise<ArtistPage | null>>();

/**
 * The page of an artist heard on the antenna, from the raw AzuraCast string.
 * `null` when the artist has no page (yet): callers show no link then.
 */
export function resolveArtistPage(name: string): Promise<ArtistPage | null> {
  const trimmed = name.trim();
  if (!trimmed) return Promise.resolve(null);
  const known = resolving.get(trimmed);
  if (known) return known;

  const request = fetch(
    `${API_BASE_URL}/api/artist/resolve?name=${encodeURIComponent(trimmed)}`
  ).then(async (response) => (response.ok ? ((await response.json()) as ArtistPage) : null));
  resolving.set(trimmed, request);
  void request.then(
    (page) => {
      if (!page) resolving.delete(trimmed);
    },
    () => resolving.delete(trimmed)
  );
  return request;
}

export interface ArtistPage {
  id: string;
  slug: string;
}

const ArtistPagesSchema = record(string(), object({ id: string(), slug: string() }));

/**
 * The pages of artists the antenna already played, from raw AzuraCast strings, in one
 * request. A name without a page is left out of the map.
 */
export async function fetchArtistPages(
  names: readonly string[],
  signal?: AbortSignal
): Promise<Map<string, ArtistPage>> {
  const response = await fetch(`${API_BASE_URL}/api/artist/pages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ names }),
    signal: signal ?? null,
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const parsed = safeParse(ArtistPagesSchema, await response.json());
  if (!parsed.success) throw new Error('invalid payload');
  return new Map(Object.entries(parsed.output));
}
