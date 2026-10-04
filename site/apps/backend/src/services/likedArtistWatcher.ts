import { sql } from 'drizzle-orm';
import { db, schema } from '../db/index';
import { logger } from '../lib/logger';
import { isPushEnabled, sendToUsers } from './pushService';
import { resolveArtist } from './artistResolver';
import { recordPlay } from './radioPlayService';
import { fetchNowPlaying, type NowPlayingTrack } from './nowPlaying';

export interface WatcherDeps {
  fetchNowPlaying: () => Promise<NowPlayingTrack | null>;
  findUserIdsByArtist: (artistLower: string) => Promise<string[]>;
  send: (userIds: string[], title: string, body: string, url: string) => Promise<unknown>;
  recordPlay: (shId: number, title: string, artist: string) => Promise<void>;
  resolveArtist: (artist: string) => Promise<unknown>;
  now?: () => number;
}

// In-memory dedupe is deliberately P0 (single replica). The Redis migration
// path is already documented in AGENTS.md if we ever scale horizontally.
const DEDUPE_MS = 12 * 60 * 60 * 1000;

export function createLikedArtistNotifier(deps: WatcherDeps): () => Promise<void> {
  const now = deps.now ?? Date.now;
  let lastShId: number | null = null;
  const lastNotified = new Map<string, number>();

  return async function check(): Promise<void> {
    const track = await deps.fetchNowPlaying();
    if (!track || track.sh_id === lastShId) return;
    lastShId = track.sh_id;

    const artistLower = track.artist.trim().toLowerCase();
    if (!artistLower) return;

    // Recorded for every new track, whether or not anyone is notified — this
    // is the artist page's floor. A write failure must not silence the push.
    try {
      await deps.recordPlay(track.sh_id, track.title, track.artist);
    } catch (err) {
      logger.warn('radioPlay.record_failed', {
        artist: track.artist,
        message: (err as Error).message,
      });
    }

    // Every artist the antenna plays gets its identity, MBID included, at its
    // first play rather than when a listener opens its page: that is what
    // links the antenna to the frieze (docs/vision.md §4.4). Not awaited, so a
    // slow lookup never delays the notification.
    deps.resolveArtist(track.artist).catch((err: unknown) => {
      logger.warn('artist.resolve_failed', {
        artist: track.artist,
        message: err instanceof Error ? err.message : String(err),
      });
    });

    const userIds = await deps.findUserIdsByArtist(artistLower);
    const cutoff = now() - DEDUPE_MS;
    const toNotify = userIds.filter((userId) => {
      const last = lastNotified.get(`${userId}:${artistLower}`);
      return last === undefined || last < cutoff;
    });
    if (toNotify.length === 0) return;

    await deps.send(
      toNotify,
      'AubeSonore',
      `${track.artist} repasse à l'antenne : « ${track.title} ».`,
      '/'
    );

    const notifiedAt = now();
    for (const userId of toNotify) {
      lastNotified.set(`${userId}:${artistLower}`, notifiedAt);
    }
    for (const [key, ts] of lastNotified) {
      if (ts < cutoff) lastNotified.delete(key);
    }
  };
}

async function findUserIdsByArtist(artistLower: string): Promise<string[]> {
  const rows = await db
    .selectDistinct({ userId: schema.likedTracks.userId })
    .from(schema.likedTracks)
    .where(sql`lower(${schema.likedTracks.artist}) = ${artistLower}`);
  return rows.map((row) => row.userId);
}

export function startLikedArtistWatcher(intervalMs = 60_000): () => void {
  // The watcher runs even without VAPID keys: recording what the antenna
  // plays feeds the artist page and must not depend on push being configured.
  const pushEnabled = isPushEnabled();
  if (!pushEnabled) {
    logger.info('liked artist notifications disabled: VAPID keys not configured');
  }

  const check = createLikedArtistNotifier({
    fetchNowPlaying,
    findUserIdsByArtist: pushEnabled ? findUserIdsByArtist : () => Promise.resolve([]),
    send: (userIds, title, body, url) => sendToUsers(userIds, title, body, url),
    recordPlay,
    resolveArtist,
  });

  const timer = setInterval(() => {
    check().catch((err: unknown) => {
      logger.warn('liked artist watcher tick failed', {
        err: err instanceof Error ? err.message : String(err),
      });
    });
  }, intervalMs);
  if (typeof timer === 'object' && timer !== null && 'unref' in timer) {
    (timer as { unref: () => void }).unref();
  }

  return () => clearInterval(timer);
}
