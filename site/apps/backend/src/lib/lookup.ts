/**
 * A lookup's three outcomes: found, a definitive miss, or a failure that is
 * never stored as a miss, so the next call retries.
 */
export type Lookup<V> = { status: 'found'; value: V } | { status: 'none' } | { status: 'failed' };
