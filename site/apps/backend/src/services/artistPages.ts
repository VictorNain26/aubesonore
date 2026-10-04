import { inArray } from 'drizzle-orm';
import { db } from '../db';
import { artist } from '../db/schema';
import { normalizeArtistName, primaryArtistName } from './artistResolver';

export interface ArtistPageRef {
  id: string;
  slug: string;
}

/** The key a raw AzuraCast name is stored under, as `resolveArtist` writes it. */
export function pageKey(raw: string): string {
  return normalizeArtistName(primaryArtistName(raw));
}

/** Pairs each raw name with the page stored under its key; a name without one is left out. */
export function matchPages(
  names: readonly string[],
  rows: readonly { normalizedName: string; id: string; slug: string }[]
): Record<string, ArtistPageRef> {
  const byKey = new Map(rows.map((row) => [row.normalizedName, { id: row.id, slug: row.slug }]));
  // fromEntries defines own properties, so a name such as "__proto__" stays a plain key.
  return Object.fromEntries(
    names.flatMap((name) => {
      const page = byKey.get(pageKey(name));
      return page ? [[name, page]] : [];
    })
  );
}

/**
 * The pages of artists the antenna already played, for raw names. A lookup only: it never
 * resolves a new artist, so it costs one indexed query and no upstream call.
 */
export async function findArtistPages(
  names: readonly string[]
): Promise<Record<string, ArtistPageRef>> {
  const keys = [...new Set(names.map(pageKey))].filter(Boolean);
  if (keys.length === 0) return {};
  const rows = await db
    .select({ id: artist.id, slug: artist.slug, normalizedName: artist.normalizedName })
    .from(artist)
    .where(inArray(artist.normalizedName, keys));
  return matchPages(names, rows);
}
