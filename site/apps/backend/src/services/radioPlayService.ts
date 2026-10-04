import { randomUUID } from 'node:crypto';
import { and, desc, eq, gte } from 'drizzle-orm';
import { db } from '../db';
import { radioPlay } from '../db/schema';
import { normalizeArtistName, primaryArtistName } from './artistResolver';

export interface RadioPlay {
  title: string;
  artist: string;
  playedAt: string;
}

const RETENTION_MS = 365 * 24 * 60 * 60 * 1000;

export function buildPlayRow(
  shId: number,
  title: string,
  artist: string,
  isrc: string | null
): {
  id: string;
  shId: number;
  title: string;
  artist: string;
  artistNormalized: string;
  isrc: string | null;
} {
  return {
    id: randomUUID(),
    shId,
    title,
    artist,
    artistNormalized: normalizeArtistName(primaryArtistName(artist)),
    isrc,
  };
}

/** Idempotent on AzuraCast's song-history id: a restart sees the current track again. */
export async function recordPlay(
  shId: number,
  title: string,
  artist: string,
  isrc: string | null
): Promise<void> {
  const row = buildPlayRow(shId, title, artist, isrc);
  if (!row.artistNormalized) return;
  await db.insert(radioPlay).values(row).onConflictDoNothing({ target: radioPlay.shId });
}

export async function getPlaysByArtist(normalizedName: string, limit = 20): Promise<RadioPlay[]> {
  const since = new Date(Date.now() - RETENTION_MS);
  const rows = await db
    .select({ title: radioPlay.title, artist: radioPlay.artist, playedAt: radioPlay.playedAt })
    .from(radioPlay)
    .where(and(eq(radioPlay.artistNormalized, normalizedName), gte(radioPlay.playedAt, since)))
    .orderBy(desc(radioPlay.playedAt))
    .limit(limit);

  return rows.map((row) => ({
    title: row.title,
    artist: row.artist,
    playedAt: row.playedAt.toISOString(),
  }));
}
