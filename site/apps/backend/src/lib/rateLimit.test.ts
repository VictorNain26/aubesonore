import { afterEach, describe, it, expect, setSystemTime } from 'bun:test';
import { __resetRateLimits, checkRate, getClientIp } from './rateLimit';

describe('checkRate', () => {
  afterEach(() => {
    setSystemTime();
    __resetRateLimits();
  });

  it('refuses past the limit, then lets the client back in once the window is over', () => {
    setSystemTime(new Date('2026-01-01T12:00:00Z'));
    expect([1, 2, 3].map(() => checkRate('scope', '203.0.113.7', 2, 60_000))).toEqual([
      true,
      true,
      false,
    ]);

    setSystemTime(new Date('2026-01-01T12:01:00.001Z'));

    expect(checkRate('scope', '203.0.113.7', 2, 60_000)).toBe(true);
  });

  it('counts each client and each scope apart', () => {
    checkRate('scope', '203.0.113.7', 1, 60_000);

    expect(checkRate('scope', '203.0.113.7', 1, 60_000)).toBe(false);
    expect(checkRate('scope', '198.51.100.2', 1, 60_000)).toBe(true);
    expect(checkRate('other', '203.0.113.7', 1, 60_000)).toBe(true);
  });
});

describe('getClientIp', () => {
  it('prefers CF-Connecting-IP over a spoofed X-Forwarded-For', () => {
    const headers = new Headers({
      'cf-connecting-ip': '203.0.113.7',
      'x-forwarded-for': '1.2.3.4, 203.0.113.7',
    });
    expect(getClientIp(headers)).toBe('203.0.113.7');
  });

  it('ignores a client-forged first X-Forwarded-For entry, using the last', () => {
    const headers = new Headers({ 'x-forwarded-for': '9.9.9.9, 203.0.113.7' });
    expect(getClientIp(headers)).toBe('203.0.113.7');
  });

  it('falls back to x-real-ip when CF-Connecting-IP is absent', () => {
    const headers = new Headers({ 'x-real-ip': '198.51.100.2' });
    expect(getClientIp(headers)).toBe('198.51.100.2');
  });

  it('returns anon when no client IP header is present', () => {
    expect(getClientIp(new Headers())).toBe('anon');
  });
});
