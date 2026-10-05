import { logger } from '../lib/logger';
import { resolveArtist } from './artistResolver';
import { recordPlay } from './radioPlayService';
import { fetchNowPlaying, type NowPlayingTrack } from './nowPlaying';

export interface WatcherDeps {
  fetchNowPlaying: () => Promise<NowPlayingTrack | null>;
  recordPlay: (shId: number, title: string, artist: string, isrc: string | null) => Promise<void>;
  resolveArtist: (artist: string) => Promise<{ id: string } | null>;
}

export function createAntennaWatcher(deps: WatcherDeps): () => Promise<void> {
  let lastShId: number | null = null;

  return async function check(): Promise<void> {
    const track = await deps.fetchNowPlaying();
    if (!track || track.sh_id === lastShId) return;
    lastShId = track.sh_id;

    if (!track.artist.trim()) return;

    // The artist page's floor: no external source knows what this radio played.
    // A write failure must not keep the artist from being identified.
    try {
      await deps.recordPlay(track.sh_id, track.title, track.artist, track.isrc);
    } catch (err) {
      logger.warn('radioPlay.record_failed', {
        artist: track.artist,
        message: (err as Error).message,
      });
    }

    // Every artist the antenna plays gets its identity, MBID included, at its
    // first play rather than when a listener opens its page: that is what
    // links the antenna to Musilogy (docs/vision.md §4.4). The play is recorded
    // first, so the resolver finds its ISRC.
    try {
      await deps.resolveArtist(track.artist);
    } catch (err) {
      logger.warn('artist.resolve_failed', {
        artist: track.artist,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };
}

export function startAntennaWatcher(intervalMs = 60_000): () => void {
  const check = createAntennaWatcher({ fetchNowPlaying, recordPlay, resolveArtist });

  const timer = setInterval(() => {
    check().catch((err: unknown) => {
      logger.warn('antenna watcher tick failed', {
        err: err instanceof Error ? err.message : String(err),
      });
    });
  }, intervalMs);
  if (typeof timer === 'object' && timer !== null && 'unref' in timer) {
    (timer as { unref: () => void }).unref();
  }

  return () => clearInterval(timer);
}
