import { Elysia } from 'elysia';
import { cors } from '@elysiajs/cors';
import { env } from './config/env';
import { pool } from './db';
import { runMigrations } from './db/migrate';
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
import { linksCache, itunesCache } from './services/trackLinksService';
import { deezerCache } from './services/deezerService';
import { musicbrainzCache } from './services/musicbrainzService';
import { titlesCache, wikipediaCache } from './services/wikipediaService';
import { commonsCache } from './services/commonsService';
import { coreCache, identityCache, musilogyCache } from './services/musilogyService';
import { trendsCache } from './services/trendsService';
import { purgeExpiredAuthRows } from './lib/auth/purgeExpiredRows';
import { startAntennaWatcher } from './services/antennaWatcher';
import { startYouTubeLinks } from './services/youtubeLinks';
import { startDiscoveredArtists } from './services/discoveredArtists';
import { coverStore } from './services/coverStore';
import { startCoverFill } from './services/coverFill';
import { startKeptCoverFill } from './services/keptTrackCovers';

// A cover taken down on request (services/coverBlocklist.txt) leaves the volume nginx serves.
try {
  const removed = await coverStore.removeBlocked();
  if (removed > 0) logger.info('coverStore.blocked_removed', { removed });
} catch (err) {
  logger.error('coverStore.blocked_not_removed', { err: (err as Error).message });
}

// Apply pending DB migrations BEFORE serving traffic. The runner tracks
// applied migrations in __app_migrations and is idempotent across restarts.
// Refusing to start with a stale schema is safer than serving 500s.
try {
  await runMigrations(pool);
} catch (err) {
  logger.error('migrations failed, aborting boot', { err: (err as Error).message });
  process.exit(1);
}

// The kept tracks' old copies of the antenna's art (Deezer's) leave the volume, once migration
// 0024 has cleared their addresses.
try {
  if (await coverStore.removeKeptCopies()) logger.info('coverStore.kept_copies_removed');
} catch (err) {
  logger.error('coverStore.kept_copies_not_removed', { err: (err as Error).message });
}

// Start TTL cache sweeps (every minute, unref'd so process can exit)
linksCache.startSweep();
itunesCache.startSweep();
trendsCache.startSweep();
deezerCache.startSweep();
musicbrainzCache.startSweep();
wikipediaCache.startSweep();
titlesCache.startSweep();
commonsCache.startSweep();
musilogyCache.startSweep();
identityCache.startSweep();
coreCache.startSweep();
coverStore.missing.startSweep();

// Periodic purge of Better Auth's expired session/verification rows.
// Without this they accumulate indefinitely — Better Auth does not self-clean.
// 6h interval is enough; the table query is O(rows-deleted) via index.
const AUTH_PURGE_INTERVAL_MS = 6 * 60 * 60 * 1000;
const purgeTimer = setInterval(() => {
  purgeExpiredAuthRows()
    .then((res) => {
      if (res.sessions > 0 || res.verifications > 0) {
        logger.info('auth purge', res);
      }
    })
    .catch((err: unknown) => {
      logger.error('auth purge failed', { err: (err as Error).message });
    });
}, AUTH_PURGE_INTERVAL_MS);
if (typeof purgeTimer === 'object' && purgeTimer !== null && 'unref' in purgeTimer) {
  (purgeTimer as { unref: () => void }).unref();
}

// Production's jobs only (env.ts, RECORD_ANTENNA): a workstation leaves the archive to it.
if (env.RECORD_ANTENNA) {
  startAntennaWatcher();
  startCoverFill();
  startKeptCoverFill();
}
startYouTubeLinks();
startDiscoveredArtists();

const app = new Elysia()
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

const server = app.listen({ port: env.PORT, hostname: '0.0.0.0' });

logger.info('listening', { port: env.PORT, env: env.NODE_ENV });

if (env.IS_PROD && env.DISABLE_EMAILS) {
  logger.error('email.disabled_in_production', {
    impact: 'verification and password-reset mails are dropped, so only OAuth sign-up works',
  });
}

let isShuttingDown = false;

async function gracefulShutdown(signal: string): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;
  logger.info('shutdown received', { signal });

  try {
    await server.stop();
  } catch (err) {
    logger.error('server.stop failed', { err: (err as Error).message });
  }

  try {
    await pool.end();
  } catch (err) {
    logger.error('pool.end failed', { err: (err as Error).message });
  }

  logger.info('shutdown complete');
  process.exit(0);
}

process.on('SIGTERM', () => {
  void gracefulShutdown('SIGTERM');
});
process.on('SIGINT', () => {
  void gracefulShutdown('SIGINT');
});

process.on('uncaughtException', (err: Error): void => {
  logger.error('uncaughtException', { err: err.message, stack: err.stack });
});
process.on('unhandledRejection', (reason: unknown): void => {
  logger.error('unhandledRejection', {
    reason: reason instanceof Error ? reason.message : String(reason),
  });
});
