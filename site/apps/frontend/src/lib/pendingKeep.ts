import type { LikeTrackRequest } from './api';

// A listener who taps Garder without an account signs in first; the track is
// kept for them once they are back (also after the Google redirect).
const KEY = 'aubesonore-pending-keep';

export function keepRequest(title: string, artist: string): LikeTrackRequest {
  return {
    title,
    artist,
    youtubeUrl: `https://www.youtube.com/results?search_query=${encodeURIComponent(`${title} ${artist}`)}`,
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
