import { Elysia } from 'elysia';
import { logger } from './logger';

const startedAt = new WeakMap<Request, number>();

/**
 * One `http` line per request, with the status the client received. It runs
 * after the response (`onAfterResponse`), which also fires for errors, failed
 * validations and unknown paths: onAfterHandle saw neither, and logged a
 * `status(404, …)` as 200. A handler that returns a `Response` (a redirect)
 * carries its status there, not in `set`. `route` is the matched pattern
 * (`/api/artist/page/:slug`), absent for an unknown path.
 */
export const requestLog = new Elysia({ name: 'request-log' })
  .onRequest(({ request }) => {
    startedAt.set(request, performance.now());
  })
  .onAfterResponse({ as: 'global' }, ({ request, set, route, responseValue }) => {
    const start = startedAt.get(request);
    logger.info('http', {
      method: request.method,
      path: new URL(request.url).pathname,
      route: route || undefined,
      status: responseValue instanceof Response ? responseValue.status : (set.status ?? 200),
      durationMs: start === undefined ? undefined : Math.round(performance.now() - start),
    });
  });
