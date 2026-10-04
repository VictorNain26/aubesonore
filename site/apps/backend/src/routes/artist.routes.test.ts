import { describe, it, expect, spyOn, afterAll, afterEach } from 'bun:test';
import { Elysia } from 'elysia';

const VALID_ID = '11111111-1111-1111-1111-111111111111';
const UNKNOWN_ID = '22222222-2222-2222-2222-222222222222';

// spyOn on the real exports, restored after this file: mock.module would
// replace these modules for every other test file of the run (Bun 1.3).
const profileService = await import('../services/artistProfileService');
const resolver = await import('../services/artistResolver');

const spies = [
  spyOn(profileService, 'getArtistProfile').mockImplementation((id: string) =>
    Promise.resolve(
      id === VALID_ID
        ? {
            id: VALID_ID,
            name: 'Daft Punk',
            slug: 'daft-punk',
            image: null,
            facts: null,
            summary: null,
            links: [],
            playedOnRadio: [],
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

describe('GET /api/artist/:id', () => {
  it('returns the profile for a known id', async () => {
    const res = await app.handle(new Request(`http://localhost/api/artist/${VALID_ID}`));

    expect(res.status).toBe(200);
    expect(((await res.json()) as { name: string }).name).toBe('Daft Punk');
  });

  it('asks the profile in the page language, French by default', async () => {
    const [profileSpy] = spies;
    await app.handle(new Request(`http://localhost/api/artist/${VALID_ID}?lang=en`));
    await app.handle(new Request(`http://localhost/api/artist/${VALID_ID}`));

    expect(profileSpy?.mock.calls.slice(-2)).toEqual([
      [VALID_ID, 'en'],
      [VALID_ID, 'fr'],
    ]);
  });

  it('rejects a language the site is not published in', async () => {
    const res = await app.handle(new Request(`http://localhost/api/artist/${VALID_ID}?lang=de`));

    expect(res.status).toBe(400);
  });

  it('rejects a malformed id at the boundary', async () => {
    const res = await app.handle(new Request('http://localhost/api/artist/not-a-uuid'));

    expect(res.status).toBe(400);
  });

  it('returns 404 for an unknown id', async () => {
    const res = await app.handle(new Request(`http://localhost/api/artist/${UNKNOWN_ID}`));

    expect(res.status).toBe(404);
  });

  it('rate limits once the per-IP budget is spent', async () => {
    const request = (): Request =>
      new Request(`http://localhost/api/artist/${VALID_ID}`, {
        headers: { 'x-forwarded-for': '203.0.113.9' },
      });

    let last = await app.handle(request());
    for (let i = 0; i < 12 && last.status !== 429; i++) {
      last = await app.handle(request());
    }

    expect(last.status).toBe(429);
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
});
