import type { ArtistProfile } from '@aubesonore/shared-types/client';
import { object, record, safeParse, string } from 'valibot';
import { getLocale, localizeHref } from '@/paraglide/runtime.js';
import { API_BASE_URL } from '../utils/config';

/** The page path of an artist, in the current language (`/artiste/…` or `/en/artist/…`). */
export function artistPath(page: { slug: string }): string {
  return localizeHref(`/artiste/${encodeURIComponent(page.slug)}`);
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

/**
 * The page of an artist heard on the antenna, from the raw AzuraCast string.
 * `null` when the artist has no page (yet): callers show no link then.
 */
export async function resolveArtistPage(
  name: string,
  signal?: AbortSignal
): Promise<{ id: string; slug: string } | null> {
  const trimmed = name.trim();
  if (!trimmed) return null;

  const response = await fetch(
    `${API_BASE_URL}/api/artist/resolve?name=${encodeURIComponent(trimmed)}`,
    { signal: signal ?? null }
  );
  if (!response.ok) return null;
  return (await response.json()) as { id: string; slug: string };
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
