import { describe, it, expect, spyOn } from 'bun:test';
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
