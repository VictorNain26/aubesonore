import { randomUUID } from 'node:crypto';
import { desc, eq } from 'drizzle-orm';
import { db } from '../db';
import { radioPlay } from '../db/schema';
import { normalizeArtistName, primaryArtistName } from './artistResolver';
import { fetchNowPlaying } from './nowPlaying';

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

type Play = { title: string; isrc: string | null };

/**
 * The latest play of this title by this artist, both compared once
 * normalised: a kept track names what the listener saw on air. The watcher
 * records a track up to a minute after it starts, so a track kept in that
 * minute is found on air instead.
 */
export async function findPlay(title: string, artist: string): Promise<Play | null> {
  const wanted = normalizeArtistName(title);
  const rows = await db
    .select({ title: radioPlay.title, isrc: radioPlay.isrc })
    .from(radioPlay)
    .where(eq(radioPlay.artistNormalized, normalizeArtistName(primaryArtistName(artist))))
    .orderBy(desc(radioPlay.playedAt))
    .limit(200);
  return (
    rows.find((row) => normalizeArtistName(row.title) === wanted) ??
    (await playOnAir(title, artist))
  );
}

/** The track on air when it is this title by this artist; AzuraCast down is no play. */
export async function playOnAir(title: string, artist: string): Promise<Play | null> {
  const current = await fetchNowPlaying().catch(() => null);
  if (
    current === null ||
    normalizeArtistName(current.title) !== normalizeArtistName(title) ||
    normalizeArtistName(primaryArtistName(current.artist)) !==
      normalizeArtistName(primaryArtistName(artist))
  ) {
    return null;
  }
  return { title: current.title, isrc: current.isrc };
}
