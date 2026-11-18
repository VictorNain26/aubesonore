import { describe, it, expect, spyOn } from 'bun:test';
import { TtlCache } from './ttlCache';

describe('TtlCache', () => {
  it('forgets every entry on clear, and keeps working', () => {
    const cache = new TtlCache<number>(60_000);
    cache.set('a', 1);

    cache.clear();
    cache.set('b', 2);

    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBe(2);
  });

  it('keeps an entry for its TTL, and not a millisecond past it', () => {
    const now = spyOn(Date, 'now').mockReturnValue(1_000_000);
    try {
      const cache = new TtlCache<string>(10);
      cache.set('a', 'hello');
      now.mockReturnValue(1_000_010);
      expect(cache.get('a')).toBe('hello');
      now.mockReturnValue(1_000_011);
      expect(cache.get('a')).toBeUndefined();
    } finally {
      now.mockRestore();
    }
  });

  it('holds 5,000 entries at most, dropping the oldest write first', () => {
    const cache = new TtlCache<number>(60_000);
    for (let i = 0; i < 5_000; i++) cache.set(`k${i}`, i);
    cache.set('k0', 0); // rewritten: now the newest

    cache.set('new', 1);

    expect(cache.size()).toBe(5_000);
    expect(cache.get('k1')).toBeUndefined();
    expect(cache.get('k0')).toBe(0);
    expect(cache.get('new')).toBe(1);
  });

  it('stores null as a real value (distinguishes from missing)', () => {
    const cache = new TtlCache<string | null>(1000);
    cache.set('a', null);
    expect(cache.get('a')).toBeNull();
  });
});
