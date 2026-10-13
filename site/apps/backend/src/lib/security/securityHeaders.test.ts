import { describe, expect, it } from 'bun:test';
import { Elysia } from 'elysia';
import { securityHeaders } from './securityHeaders';

const app = new Elysia()
  .use(securityHeaders)
  .get('/json', () => ({ ok: true }))
  .get('/page', ({ set }) => {
    set.headers['Content-Security-Policy'] = "default-src 'self'";
    return 'page';
  });

describe('securityHeaders', () => {
  it('writes the baseline headers on every route of the app it is mounted on', async () => {
    const res = await app.handle(new Request('http://localhost/json'));
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    expect(res.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
    expect(res.headers.get('content-security-policy')).toBe(
      "default-src 'none'; frame-ancestors 'none'"
    );
  });

  it("leaves a page's own CSP in place", async () => {
    const res = await app.handle(new Request('http://localhost/page'));
    expect(res.headers.get('content-security-policy')).toBe("default-src 'self'");
  });
});
