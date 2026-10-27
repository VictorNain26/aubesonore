import type { TrendsResult } from '@aubesonore/shared-types/client';
import { getJson } from './api';

/** A list the home page shows, or 'failed' when its request did not answer. */
export type Loaded<T> = T | 'failed';

/**
 * The home page's data, as its loader brings it: the week's ranking. The track before the one on
 * air comes with the live payload (home/usePreviousTrack.ts).
 */
export interface HomeData {
  trends: Loaded<TrendsResult>;
}

// The backend caches the ranking 5 minutes: a home page loaded since is drawn at once, at its
// full height, when the reader comes back to it.
const FRESH_MS = 5 * 60 * 1000;
let last: { data: HomeData; at: number } | null = null;

/**
 * The home page's ranking, before it is drawn (React Router's loader), so the page comes at its
 * height and ScrollRestoration puts the reader back on it. What this tab loaded in the last five
 * minutes is drawn at once (a client cache, reactrouter.com/how-to/client-data); a ranking that
 * fails is drawn as failing, and asked again next time.
 */
export async function homeLoader({ request }: { request: Request }): Promise<HomeData> {
  if (last && Date.now() - last.at < FRESH_MS) return last.data;
  let data: HomeData;
  try {
    data = { trends: await getJson<TrendsResult>('/api/trends', { signal: request.signal }) };
  } catch {
    return { trends: 'failed' };
  }
  if (!request.signal.aborted) last = { data, at: Date.now() };
  return data;
}

/** Forgets what the home page loaded: each test starts from a fresh tab. */
export function forgetHomeData(): void {
  last = null;
}
