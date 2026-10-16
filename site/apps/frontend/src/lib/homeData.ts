import { array, safeParse } from 'valibot';
import type { TrendsResult } from '@aubesonore/shared-types/client';
import { SongEntrySchema, type SongEntry } from './azuracast';
import { getJson } from './api';

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
  const payload = await getJson<unknown>(`/api/radio/history?rows=${HISTORY_ROWS}`, {
    signal,
    headers: { Accept: 'application/json' },
  });
  const parsed = safeParse(HistoryResponseSchema, payload);
  if (!parsed.success) throw new Error('invalid payload');
  return parsed.output as SongEntry[];
}

async function fetchTrends(signal: AbortSignal): Promise<TrendsResult> {
  return getJson<TrendsResult>('/api/trends', { signal });
}

/**
 * The home page's lists, before it is drawn (React Router's loader): the day's history and the
 * ranking, so the page comes at its height and ScrollRestoration puts the reader back on it. What
 * this tab loaded in the last five minutes is drawn at once (a client cache,
 * reactrouter.com/how-to/client-data); a list that fails is drawn as failing, and asked again next time.
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
  // A list that failed is asked again at the next visit.
  if (!request.signal.aborted && data.history !== 'failed' && data.trends !== 'failed') {
    last = { data, at: Date.now() };
  }
  return data;
}

/** Forgets what the home page loaded: each test starts from a fresh tab. */
export function forgetHomeData(): void {
  last = null;
}
