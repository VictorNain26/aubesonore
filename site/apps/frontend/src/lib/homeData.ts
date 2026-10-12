import { array, safeParse } from 'valibot';
import type { KeptArtistPage } from '@aubesonore/shared-types/client';
import { SongEntrySchema, type SongEntry } from './azuracast';
import { API_BASE_URL } from '../utils/config';

export interface TrendEntry {
  title: string;
  artist: string;
  artworkUrl: string | null;
  likes: number;
  /** The page of the artist the track is tied to, when that artist has one. */
  artistPage: KeptArtistPage | null;
}

export interface TrendsResult {
  week: TrendEntry[];
  allTime: TrendEntry[];
}

const HistoryResponseSchema = array(SongEntrySchema);

// 400 rows cover about 25 hours of antenna, so the whole day is always there.
const HISTORY_ROWS = 400;

/** A list the home page shows, or 'failed' when its request did not answer. */
export type Loaded<T> = T | 'failed';

/** The home page's lists, as its loader brings them. */
export interface HomeData {
  history: Loaded<SongEntry[]>;
  trends: Loaded<TrendsResult>;
}

// The backend caches the ranking 5 minutes, and the live payload keeps the day's top fresh: a home
// page loaded since is drawn at once, at its full height, when the reader comes back to it.
const FRESH_MS = 5 * 60 * 1000;
let last: { data: HomeData; at: number } | null = null;

async function fetchHistory(signal: AbortSignal): Promise<SongEntry[]> {
  const res = await fetch(`${API_BASE_URL}/api/radio/history?rows=${HISTORY_ROWS}`, {
    signal,
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const parsed = safeParse(HistoryResponseSchema, await res.json());
  if (!parsed.success) throw new Error('invalid payload');
  return parsed.output as SongEntry[];
}

async function fetchTrends(signal: AbortSignal): Promise<TrendsResult> {
  const res = await fetch(`${API_BASE_URL}/api/trends`, { signal });
  if (!res.ok) throw new Error(`trends ${res.status}`);
  return (await res.json()) as TrendsResult;
}

/**
 * The home page's lists, before it is drawn (React Router's loader): the day's history and the
 * ranking, so the page comes at its height and ScrollRestoration puts the reader back on it. What
 * this tab loaded in the last five minutes is drawn at once (a client cache,
 * reactrouter.com/how-to/client-data); a list that fails is drawn as failing.
 */
export async function homeLoader({ request }: { request: Request }): Promise<HomeData> {
  if (last && Date.now() - last.at < FRESH_MS) return last.data;
  const [history, trends] = await Promise.allSettled([
    fetchHistory(request.signal),
    fetchTrends(request.signal),
  ]);
  const data: HomeData = {
    history: history.status === 'fulfilled' ? history.value : 'failed',
    trends: trends.status === 'fulfilled' ? trends.value : 'failed',
  };
  if (!request.signal.aborted) last = { data, at: Date.now() };
  return data;
}

/** Forgets what the home page loaded: each test starts from a fresh tab. */
export function forgetHomeData(): void {
  last = null;
}
