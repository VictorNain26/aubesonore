import { describe, it, expect, spyOn, afterAll, afterEach } from 'bun:test';
import { Elysia } from 'elysia';

const VALID_ID = '11111111-1111-1111-1111-111111111111';
const UNKNOWN_ID = '22222222-2222-2222-2222-222222222222';

// Mirrors the head tags of apps/frontend/index.html that the page rewrites.
const SHELL = `<!doctype html><html lang="fr"><head>
<title>AubeSonore — home</title>
<meta name="description" content="home description" />
<link rel="canonical" href="https://aubesonore.fr/" />
<meta property="og:type" content="website" />
<meta property="og:title" content="home title" />
<meta property="og:description" content="home description" />
<meta property="og:image" content="https://aubesonore.fr/og-fr.png" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:image:alt" content="AubeSonore" />
<meta property="og:url" content="https://aubesonore.fr/" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="home title" />
<meta name="twitter:description" content="home description" />
<meta name="twitter:image" content="https://aubesonore.fr/og-fr.png" />
<meta property="og:locale" content="fr_FR" />
</head><body><div id="root"></div></body></html>`;

let profileName = 'Daft Punk';
let profileImage: string | null = 'https://cdn-images.dzcdn.net/images/artist/dp.jpg';

// spyOn on the real exports, restored after this file: mock.module would
// replace these modules for every other test file of the run (Bun 1.3).
const profileService = await import('../services/artistProfileService');
const profileSpy = spyOn(profileService, 'getArtistProfile').mockImplementation((id: string) =>
  Promise.resolve(
    id === VALID_ID
      ? {
          id: VALID_ID,
          name: profileName,
          slug: 'daft-punk',
          image: profileImage,
          facts: null,
          summary: {
            text: 'Un duo français.',
            lang: 'fr' as const,
            url: 'https://fr.wikipedia.org/wiki/Daft_Punk',
          },
          links: [],
          playedOnRadio: [],
        }
      : null
  )
);

afterAll(() => {
  profileSpy.mockRestore();
});

const { artistPageRoutes, __resetArtistShell } = await import('./artistPage.routes');
const { env } = await import('../config/env');
const { __resetRateLimits } = await import('../lib/rateLimit');

const originalFetch = globalThis.fetch;
const app = new Elysia().use(artistPageRoutes);

afterEach(() => {
  globalThis.fetch = originalFetch;
  __resetArtistShell();
  __resetRateLimits();
  profileName = 'Daft Punk';
  profileImage = 'https://cdn-images.dzcdn.net/images/artist/dp.jpg';
});

let shellUrl = '';

function mockShell(): void {
  globalThis.fetch = ((input: string | URL) => {
    shellUrl = String(input);
    return Promise.resolve(new Response(SHELL, { headers: { 'content-type': 'text/html' } }));
  }) as unknown as typeof fetch;
}

function count(html: string, needle: string): number {
  return html.split(needle).length - 1;
}

describe('GET /artist/:id', () => {
  it('rewrites the head tags of the empty shell in place', async () => {
    mockShell();

    const res = await app.handle(new Request(`http://localhost/artist/${VALID_ID}/daft-punk`));

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(shellUrl).toEndWith('/app.html');
    const html = await res.text();
    const pageUrl = `${env.FRONTEND_BASE_URL}/artist/${VALID_ID}/daft-punk`;
    expect(html).toContain('<title>Daft Punk — AubeSonore</title>');
    expect(html).toContain(`<link rel="canonical" href="${pageUrl}" />`);
    expect(html).toContain(`<meta property="og:url" content="${pageUrl}" />`);
    expect(html).toContain('<meta property="og:title" content="Daft Punk — AubeSonore" />');
    expect(html).toContain('<meta name="description" content="Un duo français." />');
    expect(html).toContain(
      '<meta property="og:image" content="https://cdn-images.dzcdn.net/images/artist/dp.jpg" />'
    );
    expect(html).not.toContain('og-fr.png');
    expect(html).not.toContain('og:image:width');
    expect(html).not.toContain('https://aubesonore.fr/"');
    expect(count(html, 'property="og:title"')).toBe(1);
    expect(count(html, 'rel="canonical"')).toBe(1);
    expect(html).toContain('<div id="root"></div>');
  });

  it('serves the same tags on the slug-decorated url', async () => {
    mockShell();

    const res = await app.handle(new Request(`http://localhost/artist/${VALID_ID}/daft-punk`));

    expect(res.status).toBe(200);
    expect(await res.text()).toContain('property="og:title"');
  });

  it('keeps an artist name inside its attribute and its text node', async () => {
    mockShell();
    profileName = 'AT&T "><script>alert(1)</script>';

    const res = await app.handle(new Request(`http://localhost/artist/${VALID_ID}`));

    const html = await res.text();
    expect(html).not.toContain('"><script>');
    expect(html).toContain(
      '<meta property="og:title" content="AT&amp;T &quot;><script>alert(1)</script> — AubeSonore" />'
    );
    expect(html).toContain(
      '<title>AT&amp;T "&gt;&lt;script&gt;alert(1)&lt;/script&gt; — AubeSonore</title>'
    );
  });

  it('keeps the default share image when the artist image is not on an allowed host', async () => {
    mockShell();
    profileImage = 'https://evil.example/pwn.jpg';

    const res = await app.handle(new Request(`http://localhost/artist/${VALID_ID}`));

    const html = await res.text();
    expect(html).not.toContain('evil.example');
    expect(html).toContain(
      '<meta property="og:image" content="https://aubesonore.fr/og-fr.png" />'
    );
    expect(html).toContain('og:image:width');
  });

  it('drops a non-https og:image', async () => {
    mockShell();
    profileImage = 'http://cdn-images.dzcdn.net/images/artist/dp.jpg';

    const res = await app.handle(new Request(`http://localhost/artist/${VALID_ID}`));

    expect(await res.text()).not.toContain('http://cdn-images.dzcdn.net');
  });

  it('answers a malformed id like an unknown artist, without a lookup', async () => {
    mockShell();
    profileSpy.mockClear();

    const res = await app.handle(new Request('http://localhost/en/artist/not-a-uuid'));

    expect(res.status).toBe(404);
    expect(await res.text()).toBe(SHELL);
    expect(profileSpy).not.toHaveBeenCalled();
  });

  it('serves the English page under /en/ with its own url, language and fallback text', async () => {
    mockShell();
    profileImage = null;

    const res = await app.handle(new Request(`http://localhost/en/artist/${VALID_ID}/daft-punk`));

    const html = await res.text();
    expect(html).toContain('<html lang="en">');
    expect(html).toContain(`href="${env.FRONTEND_BASE_URL}/en/artist/${VALID_ID}/daft-punk"`);
    expect(html).toContain('<meta property="og:locale" content="en_GB" />');
    expect(html).toContain(
      '<meta property="og:image" content="https://aubesonore.fr/og-en.png" />'
    );
    expect(html).toContain(
      '<meta name="twitter:image" content="https://aubesonore.fr/og-en.png" />'
    );
  });

  it('answers 404 with the untouched shell when the artist is unknown', async () => {
    mockShell();

    const res = await app.handle(new Request(`http://localhost/artist/${UNKNOWN_ID}`));

    expect(res.status).toBe(404);
    expect(await res.text()).toBe(SHELL);
  });

  it('returns 502 when the frontend shell cannot be read', async () => {
    globalThis.fetch = (() =>
      Promise.resolve(new Response(null, { status: 500 }))) as unknown as typeof fetch;

    const res = await app.handle(new Request(`http://localhost/artist/${VALID_ID}`));

    expect(res.status).toBe(502);
  });

  it('revalidates the shell with its ETag and reuses it on 304', async () => {
    const seen: Array<string | null> = [];
    globalThis.fetch = ((_: string, init?: RequestInit) => {
      const etag = new Headers(init?.headers).get('if-none-match');
      seen.push(etag);
      return Promise.resolve(
        etag === '"v1"'
          ? new Response(null, { status: 304 })
          : new Response(SHELL, { headers: { etag: '"v1"' } })
      );
    }) as unknown as typeof fetch;

    await app.handle(new Request(`http://localhost/artist/${VALID_ID}`));
    const res = await app.handle(new Request(`http://localhost/artist/${VALID_ID}`));

    expect(seen).toEqual([null, '"v1"']);
    expect(await res.text()).toContain('Daft Punk — AubeSonore');
  });

  it('serves the new shell as soon as a deploy changes it', async () => {
    let version = 'old';
    globalThis.fetch = (() =>
      Promise.resolve(
        new Response(SHELL.replace('<div id="root">', `<div data-build="${version}" id="root">`), {
          headers: { etag: `"${version}"` },
        })
      )) as unknown as typeof fetch;

    await app.handle(new Request(`http://localhost/artist/${VALID_ID}`));
    version = 'new';
    const res = await app.handle(new Request(`http://localhost/artist/${VALID_ID}`));

    expect(await res.text()).toContain('data-build="new"');
  });

  it('keeps the last shell when the frontend container is briefly unreachable', async () => {
    mockShell();
    await app.handle(new Request(`http://localhost/artist/${VALID_ID}`));
    globalThis.fetch = (() => Promise.reject(new Error('ECONNREFUSED'))) as unknown as typeof fetch;

    const res = await app.handle(new Request(`http://localhost/artist/${VALID_ID}`));

    expect(res.status).toBe(200);
  });

  it('asks browsers to revalidate the page', async () => {
    mockShell();

    const res = await app.handle(new Request(`http://localhost/artist/${VALID_ID}`));

    expect(res.headers.get('cache-control')).toBe('no-cache');
  });
});
