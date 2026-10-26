import { eq, isNotNull } from 'drizzle-orm';
import { db } from '../db';
import { artist } from '../db/schema';
import { mbidSlug, ownSlug, pageSlug } from './artistSlugs';

/** The MBIDs of the artists the antenna played: the pages Musilogy's links start from. */
export async function listPlayedMbids(): Promise<string[]> {
  const rows = await db.select({ mbid: artist.mbid }).from(artist).where(isNotNull(artist.mbid));
  return rows.flatMap((row) => (row.mbid ? [row.mbid] : []));
}

/** Every played artist's page slug, in a stable order: the pages the sitemap lists. */
export async function listArtistSlugs(): Promise<string[]> {
  const rows = await db
    .select({ slug: pageSlug })
    .from(artist)
    .leftJoin(mbidSlug, eq(mbidSlug.mbid, artist.mbid))
    .leftJoin(ownSlug, eq(ownSlug.artistId, artist.id))
    .orderBy(pageSlug);
  return rows.flatMap((row) => (row.slug ? [row.slug] : []));
}
