// The surface a Redis-backed store would keep, so a cache can move there without its callers
// changing (docs/scaling-roadmap.md).
export interface CacheStore<V> {
  get(key: string): V | undefined;
  set(key: string, value: V, ttlMsOverride?: number): void;
}

// Several caches are keyed by what a caller sends (a title, an artist name, an MBID): without a
// cap, a client asking many distinct keys fills the backend's 1 GB.
const MAX_ENTRIES = 5_000;

/**
 * In-memory TTL cache with periodic sweep, holding at most MAX_ENTRIES: a write into a full cache
 * drops the oldest write.
 * Suitable for a single backend instance, which the site runs.
 * For multi-instance deployments, implement a Redis-backed `CacheStore<V>`
 * with the same surface and swap at the import site.
 *
 * Without the sweep, entries that are written once and never read again
 * (e.g. one-off link lookups) would sit in memory until process restart.
 */
export class TtlCache<V> implements CacheStore<V> {
  private readonly store = new Map<string, { value: V; expiresAt: number }>();
  private sweepTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly ttlMs: number) {}

  get(key: string): V | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt < Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: V, ttlMsOverride?: number): void {
    const ttl = ttlMsOverride ?? this.ttlMs;
    // A Map keeps insertion order: a rewritten key moves to the end, the first key is the oldest.
    this.store.delete(key);
    if (this.store.size >= MAX_ENTRIES) {
      const oldest = this.store.keys().next().value;
      if (oldest !== undefined) this.store.delete(oldest);
    }
    this.store.set(key, { value, expiresAt: Date.now() + ttl });
  }

  size(): number {
    return this.store.size;
  }

  /**
   * Start a background sweep that purges expired entries every `intervalMs`.
   * The timer is `unref()`'d so it does not keep the event loop alive.
   * Safe to call multiple times — subsequent calls are no-ops.
   */
  startSweep(intervalMs = 60_000): void {
    if (this.sweepTimer) return;
    const timer = setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this.store) {
        if (entry.expiresAt < now) this.store.delete(key);
      }
    }, intervalMs);
    if (typeof timer === 'object' && timer !== null && 'unref' in timer) {
      (timer as { unref: () => void }).unref();
    }
    this.sweepTimer = timer;
  }

  /** Forget every entry; the sweep goes on. */
  clear(): void {
    this.store.clear();
  }

  /** Stop the sweep timer and clear the store. Call on process shutdown. */
  dispose(): void {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
    this.store.clear();
  }
}
