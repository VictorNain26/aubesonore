import { describe, it, expect, spyOn, afterAll, afterEach } from 'bun:test';
import { Elysia } from 'elysia';

const VALID_ID = '11111111-1111-1111-1111-111111111111';

// spyOn on the real exports, restored after this file.
const profileService = await import('../services/artistProfileService');
const resolver = await import('../services/artistResolver');

const spies = [
  spyOn(profileService, 'getArtistProfile').mockImplementation((slug: string) =>
    slug === 'broken'
      ? Promise.reject(new Error('terminating connection'))
      : Promise.resolve(
          slug === 'daft-punk'
            ? {
                id: VALID_ID,
                name: 'Daft Punk',
                slug: 'daft-punk',
                mbid: null,
                images: [],
                facts: null,
                summary: null,
                links: [],
                played: true,
              }
            : null
        )
  ),
  spyOn(resolver, 'resolveArtist').mockImplementation((name: string) =>
    Promise.resolve(name === 'Daft Punk' ? { id: VALID_ID, slug: 'daft-punk' } : null)
  ),
];

afterAll(() => {
  for (const spy of spies) spy.mockRestore();
});

const { artistRoutes } = await import('./artist.routes');
const { __resetRateLimits } = await import('../lib/rateLimit');

const app = new Elysia().use(artistRoutes);

afterEach(() => {
  __resetRateLimits();
});

describe('GET /api/artist/page/:slug', () => {
  it('returns the profile for a known slug', async () => {
    const res = await app.handle(new Request(`http://localhost/api/artist/page/daft-punk`));

    expect(res.status).toBe(200);
    expect(((await res.json()) as { name: string }).name).toBe('Daft Punk');
  });

  it('asks the profile in the page language, French by default', async () => {
    const [profileSpy] = spies;
    await app.handle(new Request(`http://localhost/api/artist/page/daft-punk?lang=en`));
    await app.handle(new Request(`http://localhost/api/artist/page/daft-punk`));

    expect(profileSpy?.mock.calls.slice(-2)).toEqual([
      ['daft-punk', 'en'],
      ['daft-punk', 'fr'],
    ]);
  });

  it('rejects a language the site is not published in', async () => {
    const res = await app.handle(new Request(`http://localhost/api/artist/page/daft-punk?lang=de`));

    expect(res.status).toBe(400);
  });

  it('rejects a malformed slug at the boundary', async () => {
    const res = await app.handle(new Request('http://localhost/api/artist/page/Daft%20Punk'));

    expect(res.status).toBe(400);
  });

  it('returns 404 for an unknown slug', async () => {
    const res = await app.handle(new Request('http://localhost/api/artist/page/inconnu'));

    expect(res.status).toBe(404);
  });

  it('lets a failure other than Musilogy loading through, never as « unavailable »', async () => {
    const res = await app.handle(new Request('http://localhost/api/artist/page/broken'));

    expect(res.status).toBe(500);
  });

  it('rate limits once the per-IP budget is spent', async () => {
    const request = (): Request =>
      new Request(`http://localhost/api/artist/page/daft-punk`, {
        headers: { 'x-forwarded-for': '203.0.113.9' },
      });

    // A walk from artist to artist opens many pages: 60 a minute, apart from
    // the resolver's 10.
    const statuses: number[] = [];
    for (let i = 0; i < 61; i++) statuses.push((await app.handle(request())).status);

    expect(statuses.slice(0, 60).every((status) => status !== 429)).toBe(true);
    expect(statuses[60]).toBe(429);
  });
});

describe('GET /api/artist/resolve', () => {
  it('resolves a raw name to a canonical id', async () => {
    const res = await app.handle(
      new Request('http://localhost/api/artist/resolve?name=Daft%20Punk')
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: VALID_ID, slug: 'daft-punk' });
  });

  it('requires a name', async () => {
    const res = await app.handle(new Request('http://localhost/api/artist/resolve'));

    expect(res.status).toBe(400);
  });

  it('returns 404 when the name resolves to nothing', async () => {
    const res = await app.handle(
      new Request('http://localhost/api/artist/resolve?name=Nobody%20At%20All')
    );

    expect(res.status).toBe(404);
  });

  // A name never seen adds an artist row: the limit keeps one client from filling the table.
  it('refuses an 11th name in a minute from one client', async () => {
    const request = () =>
      app.handle(
        new Request('http://localhost/api/artist/resolve?name=Daft%20Punk', {
          headers: { 'x-real-ip': '198.51.100.7' },
        })
      );
    for (let i = 0; i < 10; i += 1) expect((await request()).status).toBe(200);

    expect((await request()).status).toBe(429);
  });
});
