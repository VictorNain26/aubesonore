import { azuracastGet } from '../lib/azuracast';
import { TtlCache } from '../lib/cache/ttlCache';
import { createSingleFlight } from '../lib/singleFlight';

const HISTORY_CACHE_TTL_MS = 60_000;
const FETCH_TIMEOUT_MS = 10_000;

export const radioHistoryCache = new TtlCache<unknown[]>(HISTORY_CACHE_TTL_MS);
const flight = createSingleFlight<unknown[]>();

/**
 * `rows` is caller-clamped (route layer) before reaching here — it is the
 * only piece of caller input interpolated into the AzuraCast URL.
 */
export async function getStationHistory(rows: number): Promise<unknown[]> {
  const cacheKey = String(rows);
  const cached = radioHistoryCache.get(cacheKey);
  if (cached !== undefined) return cached;
  return flight(cacheKey, () => fetchHistory(rows, cacheKey));
}

async function fetchHistory(rows: number, cacheKey: string): Promise<unknown[]> {
  // `per_page` alone: `rows` without pagination ignores the limit (returns
  // the full 5800+ entry history), and the paginated response is an
  // envelope `{page, per_page, total, rows: [...]}`, not a flat array.
  const payload = (await azuracastGet(`history?per_page=${rows}`, FETCH_TIMEOUT_MS)) as {
    rows?: unknown;
  };
  if (!Array.isArray(payload.rows)) {
    throw new Error('AzuraCast history error: unexpected payload shape');
  }
  const historyRows: unknown[] = payload.rows;
  radioHistoryCache.set(cacheKey, historyRows);
  return historyRows;
}
