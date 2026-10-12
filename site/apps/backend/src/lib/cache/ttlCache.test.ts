import { describe, it, expect } from 'bun:test';
import { TtlCache } from './ttlCache';

describe('TtlCache', () => {
  it('stores and retrieves a value within TTL', () => {
    const cache = new TtlCache<string>(1000);
    cache.set('a', 'hello');
    expect(cache.get('a')).toBe('hello');
  });

  it('forgets every entry on clear, and keeps working', () => {
    const cache = new TtlCache<number>(60_000);
    cache.set('a', 1);

    cache.clear();
    cache.set('b', 2);

    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBe(2);
  });

  it('returns undefined for missing key', () => {
    const cache = new TtlCache<string>(1000);
    expect(cache.get('missing')).toBeUndefined();
  });

  it('expires entries after TTL', async () => {
    const cache = new TtlCache<string>(10);
    cache.set('a', 'hello');
    await new Promise((r) => setTimeout(r, 20));
    expect(cache.get('a')).toBeUndefined();
  });

  it('stores null as a real value (distinguishes from missing)', () => {
    const cache = new TtlCache<string | null>(1000);
    cache.set('a', null);
    expect(cache.get('a')).toBeNull();
  });

  it('delete removes the entry', () => {
    const cache = new TtlCache<string>(1000);
    cache.set('a', 'x');
    cache.delete('a');
    expect(cache.get('a')).toBeUndefined();
  });
});
