import type { ArtistPageRef } from '@aubesonore/shared-types/client';
import { eq, inArray, isNotNull } from 'drizzle-orm';
import { db } from '../db';
import { artist, artistSlug } from '../db/schema';
import { artistKey } from './artistResolver';

/** Pairs each raw name with the page stored under its key; a name without one is left out. */
export function matchPages(
  names: readonly string[],
  rows: readonly { normalizedName: string; id: string; slug: string }[]
): Record<string, ArtistPageRef> {
  const byKey = new Map(rows.map((row) => [row.normalizedName, { id: row.id, slug: row.slug }]));
  // fromEntries defines own properties, so a name such as "__proto__" stays a plain key.
  return Object.fromEntries(
    names.flatMap((name) => {
      const page = byKey.get(artistKey(name));
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
  const keys = [...new Set(names.map(artistKey))].filter(Boolean);
  if (keys.length === 0) return {};
  const rows = await db
    .select({ id: artist.id, slug: artistSlug.slug, normalizedName: artist.normalizedName })
    .from(artist)
    .innerJoin(artistSlug, eq(artistSlug.artistId, artist.id))
    .where(inArray(artist.normalizedName, keys));
  return matchPages(names, rows);
}

/** The MBIDs of the artists the antenna played: the pages Musilogy's links start from. */
export async function listPlayedMbids(): Promise<string[]> {
  const rows = await db
    .select({ mbid: artist.mbid })
    .from(artist)
    .innerJoin(artistSlug, eq(artistSlug.artistId, artist.id))
    .where(isNotNull(artist.mbid));
  return rows.flatMap((row) => (row.mbid ? [row.mbid] : []));
}

/** Every artist page's slug, in a stable order: the pages the sitemap lists. */
export async function listArtistSlugs(): Promise<string[]> {
  const rows = await db.select({ slug: artistSlug.slug }).from(artistSlug).orderBy(artistSlug.slug);
  return rows.map((row) => row.slug);
}

/** The slug of an artist's page, for the addresses it had before slugs (/artist/<id>/…). */
export async function slugOfArtist(id: string): Promise<string | null> {
  const rows = await db
    .select({ slug: artistSlug.slug })
    .from(artistSlug)
    .where(eq(artistSlug.artistId, id))
    .limit(1);
  return rows[0]?.slug ?? null;
}
