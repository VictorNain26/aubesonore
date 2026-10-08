// In-memory IP rate limiter.
//
// Same multi-instance caveat as `lib/cache/ttlCache.ts`: each replica keeps
// its own counter, so the *effective* limit per IP is `limit × replicas`.
// Acceptable today (mono-instance); migrate to Redis with the other
// in-memory state when horizontal scaling is enabled. See CLAUDE.md
// "Scaling roadmap" for the trigger.

const TOO_MANY = { error: 'Trop de requêtes, réessayez dans 1 minute' } as const;

/** Marks the response 429, retry in a minute (every window is one), and gives the JSON body. */
export function tooManyRequests(set: {
  status?: number | string;
  headers: Record<string, string | number>;
}): typeof TOO_MANY {
  set.status = 429;
  set.headers['retry-after'] = '60';
  return TOO_MANY;
}

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();
const SWEEP_INTERVAL_MS = 5 * 60_000;

// Periodic eviction of expired buckets so the Map doesn't grow unbounded.
// `unref()` so the timer doesn't block process exit in tests.
const sweepTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt < now) buckets.delete(key);
  }
}, SWEEP_INTERVAL_MS);
if (typeof sweepTimer.unref === 'function') sweepTimer.unref();

/**
 * Per-IP fixed-window rate check.
 * Returns true if the request fits in the current window, false if rejected.
 *
 * @param scope  logical bucket name (e.g. 'artist'), keeps endpoints independent
 * @param ip     caller identity (typically the first x-forwarded-for IP)
 * @param limit  max requests within the window
 * @param windowMs window size in milliseconds
 */
export function checkRate(scope: string, ip: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const key = `${scope}:${ip}`;
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (bucket.count >= limit) return false;
  bucket.count++;
  return true;
}

/**
 * Extract the caller IP from request headers.
 *
 * The origin is only reachable through the Cloudflare Tunnel, so
 * `CF-Connecting-IP` — set by Cloudflare's edge and stripped of any
 * client-supplied value — is the authoritative client IP. The first
 * `x-forwarded-for` entry is client-controlled (Cloudflare *appends* the real
 * IP), so it must not be trusted for a rate-limit key; only the last entry,
 * appended by the nearest proxy, is. Falls back to `'anon'` so a missing header
 * isn't a free pass for the same caller.
 */
export function getClientIp(headers: Headers): string {
  const cf = headers.get('cf-connecting-ip')?.trim();
  if (cf) return cf;

  const realIp = headers.get('x-real-ip')?.trim();
  if (realIp) return realIp;

  const xff = headers.get('x-forwarded-for');
  if (xff) {
    const parts = xff.split(',');
    const last = parts[parts.length - 1]?.trim();
    if (last) return last;
  }
  return 'anon';
}

/** @internal Test-only reset. */
export function __resetRateLimits(): void {
  buckets.clear();
}
