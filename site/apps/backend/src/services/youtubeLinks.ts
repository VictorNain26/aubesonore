import { and, eq, gt, inArray, isNotNull, lt, or } from 'drizzle-orm';
import { db, schema } from '../db/index';
import { logger } from '../lib/logger';
import { normalizeArtistName, primaryArtistName } from './artistResolver';
import {
  existingVideos,
  findArtTrack,
  isYouTubeEnabled,
  isYouTubePaused,
  VIDEOS_PER_CALL,
  videoUrl,
} from './youtubeService';

const DAY_MS = 24 * 60 * 60 * 1000;
// YouTube API data is refreshed or deleted within 30 calendar days (Developer Policies
// III.E.4.d): a link older than that is never served, and is refreshed well before.
const SERVED_FOR_MS = 30 * DAY_MS;
const REFRESH_AFTER_MS = 25 * DAY_MS;
// A song without an Art Track is asked again a month later: recent releases get theirs late.
const SEARCH_AGAIN_AFTER_MS = 30 * DAY_MS;
const SEARCHES_PER_RUN = 20;
const REFRESHES_PER_RUN = 500;
const RUN_EVERY_MS = 60 * 60 * 1000;
const FIRST_RUN_AFTER_MS = 60 * 1000;

/** One song for every listener who keeps it: its primary artist and title, normalized. */
export function songKey(title: string, artist: string): string {
  return `${normalizeArtistName(primaryArtistName(artist))}|${normalizeArtistName(title)}`;
}

/** Searches the song's Art Track unless a recent answer is stored; a failure stores nothing. */
export async function resolveSong(title: string, artist: string): Promise<void> {
  if (!isYouTubeEnabled()) return;
  const key = songKey(title, artist);
  const [row] = await db
    .select()
    .from(schema.youtubeLink)
    .where(eq(schema.youtubeLink.songKey, key))
    .limit(1);
  if (
    row &&
    (row.videoId !== null || row.checkedAt.getTime() > Date.now() - SEARCH_AGAIN_AFTER_MS)
  ) {
    return;
  }

  const found = await findArtTrack(title, artist);
  if (found.status === 'failed') return;
  const values = {
    videoId: found.status === 'found' ? found.value : null,
    checkedAt: new Date(),
  };
  await db
    .insert(schema.youtubeLink)
    .values({ songKey: key, ...values })
    .onConflictDoUpdate({ target: schema.youtubeLink.songKey, set: values });
}

/** The direct link of each song that has a fresh one, by songKey. */
export async function youtubeUrls(
  songs: readonly { title: string; artist: string }[]
): Promise<Map<string, string>> {
  const keys = [...new Set(songs.map((song) => songKey(song.title, song.artist)))];
  if (keys.length === 0) return new Map();
  const rows = await db
    .select({ songKey: schema.youtubeLink.songKey, videoId: schema.youtubeLink.videoId })
    .from(schema.youtubeLink)
    .where(
      and(
        inArray(schema.youtubeLink.songKey, keys),
        isNotNull(schema.youtubeLink.videoId),
        gt(schema.youtubeLink.checkedAt, new Date(Date.now() - SERVED_FOR_MS))
      )
    );
  return new Map(
    rows.flatMap((row) => (row.videoId ? [[row.songKey, videoUrl(row.videoId)]] : []))
  );
}

/**
 * Asks YouTube again for the stored videos before their 30 days run out (videos.list, 50 ids for
 * one unit of the large bucket): one still there is dated again, one gone is forgotten, so the
 * song is searched anew.
 */
async function refreshStoredLinks(): Promise<void> {
  const rows = await db
    .select({ songKey: schema.youtubeLink.songKey, videoId: schema.youtubeLink.videoId })
    .from(schema.youtubeLink)
    .where(
      and(
        isNotNull(schema.youtubeLink.videoId),
        lt(schema.youtubeLink.checkedAt, new Date(Date.now() - REFRESH_AFTER_MS))
      )
    )
    .limit(REFRESHES_PER_RUN);

  for (let i = 0; i < rows.length; i += VIDEOS_PER_CALL) {
    const batch = rows.slice(i, i + VIDEOS_PER_CALL);
    const present = await existingVideos(batch.map((row) => row.videoId as string));
    if (present === null) return;
    const kept = batch.filter((row) => present.has(row.videoId as string)).map((r) => r.songKey);
    const gone = batch.filter((row) => !present.has(row.videoId as string)).map((r) => r.songKey);
    if (kept.length > 0) {
      await db
        .update(schema.youtubeLink)
        .set({ checkedAt: new Date() })
        .where(inArray(schema.youtubeLink.songKey, kept));
    }
    if (gone.length > 0) {
      await db.delete(schema.youtubeLink).where(inArray(schema.youtubeLink.songKey, gone));
    }
  }
}

/** The kept songs never asked about, or asked a month ago without an answer. */
async function pendingSongs(): Promise<{ title: string; artist: string }[]> {
  const kept = await db
    .selectDistinct({ title: schema.likedTracks.title, artist: schema.likedTracks.artist })
    .from(schema.likedTracks);
  // Settled: a video is stored (the refresh keeps it), or the last search is recent.
  const answered = await db
    .select({ songKey: schema.youtubeLink.songKey })
    .from(schema.youtubeLink)
    .where(
      or(
        isNotNull(schema.youtubeLink.videoId),
        gt(schema.youtubeLink.checkedAt, new Date(Date.now() - SEARCH_AGAIN_AFTER_MS))
      )
    );
  const settled = new Set(answered.map((row) => row.songKey));

  const seen = new Set<string>();
  return kept.filter((song) => {
    const key = songKey(song.title, song.artist);
    if (settled.has(key) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function run(): Promise<void> {
  await refreshStoredLinks();
  const pending = await pendingSongs();
  for (const song of pending.slice(0, SEARCHES_PER_RUN)) {
    if (isYouTubePaused()) break;
    await resolveSong(song.title, song.artist);
  }
}

/** Refreshes the stored links and searches the songs still without one, every hour. */
export function startYouTubeLinks(): () => void {
  if (!isYouTubeEnabled()) {
    logger.info('youtube links disabled: YOUTUBE_API_KEY not set');
    return () => undefined;
  }
  const tick = () => {
    run().catch((err: unknown) => {
      logger.warn('youtube.links_run_failed', { message: (err as Error).message });
    });
  };
  const first = setTimeout(tick, FIRST_RUN_AFTER_MS);
  const every = setInterval(tick, RUN_EVERY_MS);
  first.unref?.();
  every.unref?.();
  return () => {
    clearTimeout(first);
    clearInterval(every);
  };
}
