import { azuracastGet } from '../lib/azuracast';
import { toIsrc } from '../lib/isrc';

export interface NowPlayingTrack {
  sh_id: number;
  title: string;
  artist: string;
  /** Written by the pipeline into each antenna file (docs/vision.md §4.4). */
  isrc: string | null;
  /** The id of the track's art at AzuraCast (`…/art/<id>.jpg`); null for its generic image. */
  artId: string | null;
}

const ART_ID = /\/api\/station\/[\w-]+\/art\/([0-9a-f]+-[0-9]+)\.jpg$/;

const NOWPLAYING_TIMEOUT_MS = 10_000;

export async function fetchNowPlaying(): Promise<NowPlayingTrack | null> {
  // One station's endpoint answers a single object, not the array of
  // /api/nowplaying (measured 2026-10-02: { station, now_playing, ... }).
  const payload = await azuracastGet('nowplaying', NOWPLAYING_TIMEOUT_MS);
  if (typeof payload !== 'object' || payload === null) return null;
  const { now_playing: nowPlaying } = payload as { now_playing?: unknown };
  if (typeof nowPlaying !== 'object' || nowPlaying === null) return null;

  const { sh_id, song } = nowPlaying as { sh_id?: unknown; song?: unknown };
  if (typeof sh_id !== 'number' || typeof song !== 'object' || song === null) return null;

  const { title, artist, isrc, art } = song as {
    title?: unknown;
    artist?: unknown;
    isrc?: unknown;
    art?: unknown;
  };
  if (typeof title !== 'string' || typeof artist !== 'string') return null;

  const artId = typeof art === 'string' ? (ART_ID.exec(art)?.[1] ?? null) : null;
  return { sh_id, title, artist, isrc: toIsrc(isrc), artId };
}
