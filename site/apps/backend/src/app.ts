import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors';
import { env } from './config/env';
import { betterAuthPlugin } from './lib/auth/betterAuthPlugin';
import { securityHeaders, applySecurityHeaders } from './lib/security/securityHeaders';
import { requestLog } from './lib/requestLog';
import { logger } from './lib/logger';
import { trackRoutes } from './routes/track.routes';
import { artistRoutes } from './routes/artist.routes';
import { musilogyRoutes } from './routes/musilogy.routes';
import { artistPageRoutes } from './routes/artistPage.routes';
import { trendsRoutes } from './routes/trends.routes';
import { shareRoutes } from './routes/share.routes';
import { coverStoreRoutes } from './routes/coverStore.routes';
import { coverStore } from './services/coverStore';

/** The API as it serves: every plugin and route; index.ts boots it and listens. */
export const app = new Elysia()
  .use(requestLog)
  .use(securityHeaders)
  .use(
    cors({
      origin: env.ALLOWED_ORIGINS,
      credentials: true,
      methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      // The plugin's default (true) lists the request's own header names, Cloudflare's included;
      // the site reads no response header beyond the safelisted ones.
      exposeHeaders: [],
    })
  )
  .use(betterAuthPlugin)
  .use(trackRoutes)
  .use(artistRoutes)
  .use(musilogyRoutes)
  .use(artistPageRoutes)
  .use(trendsRoutes)
  .use(shareRoutes)
  .use(coverStoreRoutes(coverStore))
  .get('/health', () => ({ status: 'ok', uptime: process.uptime() }))
  .get('/', () => ({ message: 'AubeSonore API' }))
  .onError(({ error, set, request }) => {
    logger.error('Unhandled error', {
      method: request.method,
      path: new URL(request.url).pathname,
      err: error instanceof Error ? error.message : JSON.stringify(error),
    });
    applySecurityHeaders(set.headers);
    set.status = 500;
    return { error: 'Internal server error' };
  });
