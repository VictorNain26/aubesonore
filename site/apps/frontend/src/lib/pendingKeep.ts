import type { LikeTrackRequest } from './api';

// A listener who taps Garder without an account signs in first; the track is
// kept for them once they are back (also after the Google redirect).
const KEY = 'aubesonore-pending-keep';

/**
 * A YouTube search for a track: the link a kept track is stored with, and the thread's « Écouter
 * sur YouTube ». A search, not a video: finding the video takes a search.list call, whose daily
 * quota is small. The station's metadata is not trusted: it stays inside the query.
 */
export function youtubeSearchUrl(title: string, artist: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`${title} ${artist}`)}`;
}

export function keepRequest(title: string, artist: string, artworkUrl?: string): LikeTrackRequest {
  return {
    title,
    artist,
    youtubeUrl: youtubeSearchUrl(title, artist),
    ...(artworkUrl ? { artworkUrl } : {}),
  };
}

export function savePendingKeep(request: LikeTrackRequest): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(request));
  } catch {
    // private mode: the listener keeps the track again by hand
  }
}

export function takePendingKeep(): LikeTrackRequest | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    return raw ? (JSON.parse(raw) as LikeTrackRequest) : null;
  } catch {
    return null;
  }
}
