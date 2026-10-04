import { env } from '../config/env';
import { toIsrc } from '../lib/isrc';

export interface NowPlayingTrack {
  sh_id: number;
  title: string;
  artist: string;
  /** Written by the pipeline into each antenna file (docs/vision.md §4.4). */
  isrc: string | null;
}

const NOWPLAYING_TIMEOUT_MS = 10_000;

export async function fetchNowPlaying(): Promise<NowPlayingTrack | null> {
  const url = `${env.AZURACAST_BASE_URL}/api/station/${env.AZURACAST_STATION_ID}/nowplaying`;
  const response = await fetch(url, {
    headers: { 'X-API-Key': env.AZURACAST_API_KEY },
    signal: AbortSignal.timeout(NOWPLAYING_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`AzuraCast nowplaying error: ${response.status}`);
  }

  // One station's endpoint answers a single object, not the array of
  // /api/nowplaying (measured 2026-10-02: { station, now_playing, ... }).
  const payload: unknown = await response.json();
  if (typeof payload !== 'object' || payload === null) return null;
  const { now_playing: nowPlaying } = payload as { now_playing?: unknown };
  if (typeof nowPlaying !== 'object' || nowPlaying === null) return null;

  const { sh_id, song } = nowPlaying as { sh_id?: unknown; song?: unknown };
  if (typeof sh_id !== 'number' || typeof song !== 'object' || song === null) return null;

  const { title, artist, isrc } = song as { title?: unknown; artist?: unknown; isrc?: unknown };
  if (typeof title !== 'string' || typeof artist !== 'string') return null;

  return { sh_id, title, artist, isrc: toIsrc(isrc) };
}
