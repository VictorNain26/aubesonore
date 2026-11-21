import { describe, expect, it } from 'bun:test';
import { app } from './app';

// The app as index.ts serves it: the security headers are the plugin's, mounted on every route.
describe('the API', () => {
  it.each(['/health', '/'])('sends the security headers on %s', async (path) => {
    const res = await app.handle(new Request(`http://localhost${path}`));

    expect(res.status).toBe(200);
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    expect(res.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
    expect(res.headers.get('content-security-policy')).toBe(
      "default-src 'none'; frame-ancestors 'none'"
    );
  });

  // The commit the image was built from (GIT_SHA, set by CI): what an agent or a human compares
  // with origin/master to know a merge is live. A backend built elsewhere says `local`.
  it('says on /health which commit it runs', async () => {
    const res = await app.handle(new Request('http://localhost/health'));
    const body = (await res.json()) as { status: string; version: string };

    expect(body.status).toBe('ok');
    expect(body.version).toBe(Bun.env.GIT_SHA ?? 'local');
  });

  it('sends them on a path no page holds', async () => {
    const res = await app.handle(new Request('http://localhost/nowhere'));

    expect(res.status).toBe(404);
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('content-security-policy')).toBe(
      "default-src 'none'; frame-ancestors 'none'"
    );
  });
});
