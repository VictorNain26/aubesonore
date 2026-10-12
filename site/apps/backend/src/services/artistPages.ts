import type { ArtistPageRef } from '@aubesonore/shared-types/client';
import { eq, inArray, isNotNull } from 'drizzle-orm';
import { db } from '../db';
import { artist, artistSlug } from '../db/schema';
import { isValidArtistSlug } from '../validators/artistValidator';
import { artistKey, slugify } from './artistResolver';

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

/** Every played artist page's slug, in a stable order: the pages the sitemap lists. */
export async function listArtistSlugs(): Promise<string[]> {
  const rows = await db
    .select({ slug: artistSlug.slug })
    .from(artistSlug)
    .where(isNotNull(artistSlug.artistId))
    .orderBy(artistSlug.slug);
  return rows.map((row) => row.slug);
}

/** The slugs of pages never played, by MBID, for those that passed the indexing threshold. */
export async function discoveredSlugs(mbids: readonly string[]): Promise<Map<string, string>> {
  if (mbids.length === 0) return new Map();
  const rows = await db
    .select({ slug: artistSlug.slug, mbid: artistSlug.mbid })
    .from(artistSlug)
    .where(inArray(artistSlug.mbid, [...new Set(mbids)]));
  return new Map(rows.flatMap((row) => (row.mbid ? [[row.mbid, row.slug] as const] : [])));
}

/** The MBID a slug names when it is the page of an artist never played, else null. */
export async function mbidOfSlug(slug: string): Promise<string | null> {
  const rows = await db
    .select({ mbid: artistSlug.mbid })
    .from(artistSlug)
    .where(eq(artistSlug.slug, slug))
    .limit(1);
  return rows[0]?.mbid ?? null;
}

// As for played artists (artistResolver): far more homonyms than a page will meet.
const MAX_SUFFIX = 100;

/**
 * Gives the page of an artist never played the first free slug of its name, the name alone or
 * with a suffix, in the namespace the played artists share; the slug it already has, if any.
 * Null for a name with no letter or digit to make one of: the page keeps its MBID. Only the
 * indexing threshold calls it (discoveredArtists.ts), so a crawler walking Musilogy fills no table.
 */
export async function claimDiscoveredSlug(mbid: string, name: string): Promise<string | null> {
  const owned = (await discoveredSlugs([mbid])).get(mbid);
  if (owned) return owned;
  const base = slugify(name);
  if (!base) return null;
  for (let n = 1; n <= MAX_SUFFIX; n += 1) {
    const slug = n === 1 ? base : `${base}-${n}`;
    // One the page's route would refuse (too long): the page keeps its MBID.
    if (!isValidArtistSlug(slug)) return null;
    const claimed = await db
      .insert(artistSlug)
      .values({ slug, mbid })
      .onConflictDoNothing()
      .returning({ slug: artistSlug.slug });
    if (claimed[0]) return claimed[0].slug;
    // Taken by another page, or by this one in a concurrent run.
    const now = (await discoveredSlugs([mbid])).get(mbid);
    if (now) return now;
  }
  throw new Error(`artist slug: no free suffix for "${base}"`);
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
