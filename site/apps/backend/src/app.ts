import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors';
import { env } from './config/env';
import { betterAuthPlugin } from './lib/auth/betterAuthPlugin';
import { securityHeaders, applySecurityHeaders } from './lib/security/securityHeaders';
import { requestLog } from './lib/requestLog';
import { logger } from './lib/logger';
import { pgCode } from './db/errors';
import { trackRoutes } from './routes/track.routes';
import { artistRoutes } from './routes/artist.routes';
import { musilogyRoutes } from './routes/musilogy.routes';
import { artistPageRoutes } from './routes/artistPage.routes';
import { trendsRoutes } from './routes/trends.routes';
import { shareRoutes } from './routes/share.routes';
import { coverStoreRoutes } from './routes/coverStore.routes';
import { coverStore } from './services/coverStore';

/** The API as it serves: every plugin and route; index.ts boots it and listens. */
export const app = new Elysia({
  // No route takes more than a small JSON body. Bun's default is 128 MB, and api.aubesonore.fr
  // reaches this server without nginx's 1 MB: the same 1 MB here
  // (https://elysiajs.com/patterns/configuration.html#serve-maxrequestbodysize).
  serve: { maxRequestBodySize: 1024 * 1024 },
})
  // First: a hook applies only to the routes and plugins registered after it
  // (https://elysiajs.com/essential/life-cycle.html, « Order of code »). Registered last, it
  // covered nothing, and an unhandled error answered with its message: drizzle's names the query
  // and its parameters (2026-11-21).
  .onError(({ code, error, set, request }) => {
    // Elysia's own errors (a body that does not parse, a failed validation, no such route) keep
    // the answer Elysia gives them, a 4xx: only an error the code did not expect is a 500.
    if (code !== 'UNKNOWN' && code !== 'INTERNAL_SERVER_ERROR') return;
    // A failed query's own message names its SQL and parameters, which can be what a listener
    // typed or an address: Postgres' code and message say what failed without them.
    const pg = pgCode(error);
    const cause = (error as { cause?: { message?: unknown } }).cause;
    logger.error('Unhandled error', {
      method: request.method,
      path: new URL(request.url).pathname,
      err:
        pg !== undefined
          ? `${pg} ${typeof cause?.message === 'string' ? cause.message : ''}`.trim()
          : error instanceof Error
            ? error.message
            : JSON.stringify(error),
    });
    applySecurityHeaders(set.headers);
    set.status = 500;
    return { error: 'Internal server error' };
  })
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
  .get('/health', () => ({ status: 'ok', uptime: process.uptime(), version: env.GIT_SHA }))
  .get('/', () => ({ message: 'AubeSonore API' }));
