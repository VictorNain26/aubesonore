import { Elysia } from 'elysia';
import { getStationHistory } from '../services/radioService';
import { logger } from '../lib/logger';
import { checkRate, getClientIp, tooManyRequests } from '../lib/rateLimit';

const DEFAULT_ROWS = 120;
const MIN_ROWS = 1;
const MAX_ROWS = 400;
// Rows rounded up to a step: each count is its own cache entry and upstream call, so a caller
// cannot fan out 400 of them.
const ROWS_STEP = 50;
const HISTORY_LIMIT = 60;
const HISTORY_WINDOW_MS = 60_000;

function clampRows(raw: unknown): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return DEFAULT_ROWS;
  const rows = Math.min(MAX_ROWS, Math.max(MIN_ROWS, Math.trunc(parsed)));
  return Math.min(MAX_ROWS, Math.ceil(rows / ROWS_STEP) * ROWS_STEP);
}

export const radioRoutes = new Elysia({ prefix: '/api/radio' }).get(
  '/history',
  async ({ request, query, set }) => {
    if (
      !checkRate('radio-history', getClientIp(request.headers), HISTORY_LIMIT, HISTORY_WINDOW_MS)
    ) {
      return tooManyRequests(set);
    }
    const rows = query?.rows !== undefined ? clampRows(query.rows) : DEFAULT_ROWS;

    try {
      return await getStationHistory(rows);
    } catch (error) {
      logger.warn('radio.history.upstream_error', {
        message: error instanceof Error ? error.message : String(error),
      });
      set.status = 502;
      return { error: 'Radio indisponible' };
    }
  }
);
