import type { ArtistProfile, SiteLocale } from '@aubesonore/shared-types/client';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { artist } from '../db/schema';
import { logger } from '../lib/logger';
import { getArtist } from './deezerService';
import { ensureMbid } from './artistResolver';
import { getArtistByMbid, type MusicBrainzArtist } from './musicbrainzService';
import { getPlaysByArtist } from './radioPlayService';
import { getSummary } from './wikipediaService';

const SOURCE_TIMEOUT_MS = 6_000;

// A slow source degrades its own section only; the profile still answers.
async function withFallback<V>(label: string, work: Promise<V>, fallback: V): Promise<V> {
  try {
    return await Promise.race([
      work,
      new Promise<V>((_, reject) =>
        setTimeout(() => reject(new Error('source timeout')), SOURCE_TIMEOUT_MS)
      ),
    ]);
  } catch (err) {
    logger.warn('artistProfile.source_failed', { label, message: (err as Error).message });
    return fallback;
  }
}

async function musicbrainzArtist(row: {
  id: string;
  deezerId: string | null;
  mbid: string | null;
}): Promise<MusicBrainzArtist | null> {
  const mbid = await ensureMbid(row);
  if (!mbid) return null;
  const found = await getArtistByMbid(mbid);
  return found.status === 'found' ? found.value : null;
}

export async function getArtistProfile(
  id: string,
  locale: SiteLocale
): Promise<ArtistProfile | null> {
  const rows = await db
    .select({
      id: artist.id,
      displayName: artist.displayName,
      normalizedName: artist.normalizedName,
      slug: artist.slug,
      deezerId: artist.deezerId,
      mbid: artist.mbid,
    })
    .from(artist)
    .where(eq(artist.id, id))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  const [deezerArtist, musicbrainz, playedOnRadio] = await Promise.all([
    row.deezerId ? withFallback('deezer', getArtist(row.deezerId), null) : null,
    row.deezerId ? withFallback('musicbrainz', musicbrainzArtist(row), null) : null,
    withFallback('radioPlay', getPlaysByArtist(row.normalizedName), []),
  ]);

  const summary = musicbrainz?.wikidataId
    ? await withFallback('wikipedia', getSummary(musicbrainz.wikidataId, locale), null)
    : null;

  return {
    id: row.id,
    name: row.displayName,
    slug: row.slug,
    image: deezerArtist?.picture ?? null,
    facts: musicbrainz?.facts ?? null,
    summary,
    links: [
      ...(row.deezerId
        ? [{ platform: 'deezer' as const, url: `https://www.deezer.com/artist/${row.deezerId}` }]
        : []),
      ...(musicbrainz?.links ?? []),
    ],
    playedOnRadio,
  };
}
