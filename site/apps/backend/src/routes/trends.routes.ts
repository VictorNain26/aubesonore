import { Elysia } from 'elysia';
import { getTrends } from '../services/trendsService';
import { checkRate, getClientIp, tooManyRequests } from '../lib/rateLimit';

const TRENDS_LIMIT = 30;
const TRENDS_WINDOW_MS = 60_000;

export const trendsRoutes = new Elysia({ prefix: '/api/trends' }).get(
  '/',
  async ({ request, set }) => {
    const ip = getClientIp(request.headers);
    if (!checkRate('trends', ip, TRENDS_LIMIT, TRENDS_WINDOW_MS)) {
      return tooManyRequests(set);
    }

    return getTrends();
  }
);
