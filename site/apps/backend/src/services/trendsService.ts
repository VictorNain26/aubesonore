import { count, desc, eq, gt, max } from 'drizzle-orm';
import type { KeptArtistPage } from '@aubesonore/shared-types/client';
import { db, schema } from '../db/index';
import { TtlCache } from '../lib/cache/ttlCache';

export interface TrendEntry {
  title: string;
  artist: string;
  artworkUrl: string | null;
  likes: number;
  /** The page of the artist the kept track is tied to, when that artist has one. */
  artistPage: KeptArtistPage | null;
}

export interface TrendsResult {
  week: TrendEntry[];
  allTime: TrendEntry[];
}

const FIVE_MINUTES_MS = 5 * 60_000;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const TOP_LIMIT = 10;
const CACHE_KEY = 'trends';

export const trendsCache = new TtlCache<TrendsResult>(FIVE_MINUTES_MS);

async function topLikedTracks(since?: Date): Promise<TrendEntry[]> {
  let query = db
    .select({
      title: schema.likedTracks.title,
      artist: schema.likedTracks.artist,
      // MAX picks one representative cover per group; artwork_url only,
      // never artwork_base64 (payload size rule).
      artworkUrl: max(schema.likedTracks.artworkUrl),
      likes: count(),
      // Both joins match at most one row (the artist's key, its one slug), so they leave the
      // counts as they are; MAX keeps the page of a group whose tracks are tied.
      slug: max(schema.artistSlug.slug),
      name: max(schema.artist.displayName),
    })
    .from(schema.likedTracks)
    .leftJoin(schema.artist, eq(schema.artist.id, schema.likedTracks.artistId))
    .leftJoin(schema.artistSlug, eq(schema.artistSlug.artistId, schema.likedTracks.artistId))
    .$dynamic();

  if (since) {
    query = query.where(gt(schema.likedTracks.createdAt, since));
  }

  const rows = await query
    .groupBy(schema.likedTracks.title, schema.likedTracks.artist)
    .orderBy(desc(count()), desc(max(schema.likedTracks.createdAt)))
    .limit(TOP_LIMIT);
  return rows.map(({ slug, name, ...entry }) => ({
    ...entry,
    artistPage: slug !== null && name !== null ? { slug, name } : null,
  }));
}

export async function getTrends(): Promise<TrendsResult> {
  const cached = trendsCache.get(CACHE_KEY);
  if (cached) return cached;

  const sevenDaysAgo = new Date(Date.now() - WEEK_MS);
  const [week, allTime] = await Promise.all([topLikedTracks(sevenDaysAgo), topLikedTracks()]);

  const result: TrendsResult = { week, allTime };
  trendsCache.set(CACHE_KEY, result);
  return result;
}
