import { createHash } from 'crypto';
import { eq } from 'drizzle-orm';
import { env } from '../config/env';
import { db, schema } from '../db/index';
import { logger } from '../lib/logger';

const ART_PATH = /^\/api\/station\/[\w-]+\/art\/[\w.-]+$/;
const COVER_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_COVER_BYTES = 2 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 5_000;

export interface Cover {
  contentType: string;
  bytes: Buffer;
}

/**
 * Copies an AzuraCast artwork into the covers table and returns the URL that
 * serves the copy, or null when the URL is not AzuraCast art or the copy failed.
 * Only the art path is taken from the client: the bytes always come from our
 * own AzuraCast, never from a host the client chose.
 */
export async function keepCover(artworkUrl: string): Promise<string | null> {
  let path: string;
  try {
    path = new URL(artworkUrl).pathname;
  } catch {
    return null;
  }
  if (!ART_PATH.test(path)) return null;

  try {
    // AzuraCast answers a missing art with a redirect to its generic image:
    // that one must not be kept as the track's cover. Not lib/azuracast.ts: the
    // art lies outside the station's API, needs no key, and comes as bytes.
    const response = await fetch(`${env.AZURACAST_BASE_URL}${path}`, {
      redirect: 'manual',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    const contentType = response.headers.get('content-type')?.split(';')[0]?.trim() ?? '';
    if (response.status !== 200 || !COVER_TYPES.has(contentType)) {
      logger.warn('cover.not_kept', { path, status: response.status, contentType });
      return null;
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length === 0 || bytes.length > MAX_COVER_BYTES) {
      logger.warn('cover.not_kept', { path, size: bytes.length });
      return null;
    }

    const sha256 = createHash('sha256').update(bytes).digest('hex');
    await db.insert(schema.covers).values({ sha256, contentType, bytes }).onConflictDoNothing();
    return `${env.BETTER_AUTH_URL}/api/covers/${sha256}`;
  } catch (error) {
    logger.warn('cover.not_kept', {
      path,
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export async function getCover(sha256: string): Promise<Cover | null> {
  const [cover] = await db
    .select({ contentType: schema.covers.contentType, bytes: schema.covers.bytes })
    .from(schema.covers)
    .where(eq(schema.covers.sha256, sha256))
    .limit(1);
  return cover ?? null;
}
