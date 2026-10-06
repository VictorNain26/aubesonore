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
const musilogyService = await import('../services/musilogyService');
const DAFT_PUNK_MBID = '056e4f3e-d505-4dad-8ec1-d04f521cbb56';
const UNPLAYED_MBID = '8d3431db-bc83-4dc2-93b8-0e46e31d09f7';
const NOT_LOADED_MBID = '00000000-0000-4000-8000-000000000000';
const unplayed = {
  id: UNPLAYED_MBID,
  name: 'Protomartyr',
  slug: UNPLAYED_MBID,
  mbid: UNPLAYED_MBID,
  played: false,
  image: null,
  facts: null,
  summary: null,
  links: [],
  playedOnRadio: [],
};
const profileSpy = spyOn(profileService, 'getArtistProfile').mockImplementation((slug: string) => {
  if (slug === UNPLAYED_MBID) return Promise.resolve(unplayed);
  if (slug === NOT_LOADED_MBID)
    return Promise.reject(new musilogyService.MusilogyUnavailable('3F000'));
  return Promise.resolve(
    slug === 'daft-punk' || slug === 'кино' || slug === DAFT_PUNK_MBID
      ? {
          id: VALID_ID,
          name: profileName,
          slug: slug === DAFT_PUNK_MBID ? 'daft-punk' : slug,
          mbid: null,
          played: true,
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
  );
});

const pages = await import('../services/artistPages');
const slugSpy = spyOn(pages, 'slugOfArtist').mockImplementation((id: string) =>
  Promise.resolve(id === VALID_ID ? 'daft-punk' : null)
);

afterAll(() => {
  profileSpy.mockRestore();
  slugSpy.mockRestore();
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

function jsonLd(html: string): Record<string, unknown> {
  const script = /<script type="application\/ld\+json">(.*?)<\/script>/s.exec(html);
  if (!script?.[1]) throw new Error('no JSON-LD in the page');
  return JSON.parse(script[1]) as Record<string, unknown>;
}

describe('GET /artiste/:slug', () => {
  it('rewrites the head tags of the empty shell in place', async () => {
    mockShell();

    const res = await app.handle(new Request('http://localhost/artiste/daft-punk'));

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(shellUrl).toEndWith('/app.html');
    const html = await res.text();
    const pageUrl = `${env.FRONTEND_BASE_URL}/artiste/daft-punk`;
    expect(html).toContain('<title>Daft Punk · AubeSonore</title>');
    expect(html).toContain(`<link rel="canonical" href="${pageUrl}" />`);
    expect(html).toContain(`<meta property="og:url" content="${pageUrl}" />`);
    expect(html).toContain('<meta property="og:title" content="Daft Punk · AubeSonore" />');
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

  it('reads a slug written in another script, and keeps its address percent-encoded', async () => {
    mockShell();

    const res = await app.handle(new Request('http://localhost/artiste/%D0%BA%D0%B8%D0%BD%D0%BE'));

    expect(res.status).toBe(200);
    expect(await res.text()).toContain(
      `<link rel="canonical" href="${env.FRONTEND_BASE_URL}/artiste/%D0%BA%D0%B8%D0%BD%D0%BE" />`
    );
  });

  it('keeps an artist name inside its attribute and its text node', async () => {
    mockShell();
    profileName = 'AT&T "><script>alert(1)</script>';

    const res = await app.handle(new Request('http://localhost/artiste/daft-punk'));

    const html = await res.text();
    expect(html).not.toContain('"><script>');
    expect(html).toContain(
      '<meta property="og:title" content="AT&amp;T &quot;><script>alert(1)</script> · AubeSonore" />'
    );
    expect(html).toContain(
      '<title>AT&amp;T "&gt;&lt;script&gt;alert(1)&lt;/script&gt; · AubeSonore</title>'
    );
  });

  it('declares its French and English versions, French by default', async () => {
    mockShell();

    for (const path of ['/artiste/daft-punk', '/en/artist/daft-punk']) {
      const html = await (await app.handle(new Request(`http://localhost${path}`))).text();
      expect(html).toContain(
        `<link rel="alternate" hreflang="fr" href="${env.FRONTEND_BASE_URL}/artiste/daft-punk" />` +
          `<link rel="alternate" hreflang="en" href="${env.FRONTEND_BASE_URL}/en/artist/daft-punk" />` +
          `<link rel="alternate" hreflang="x-default" href="${env.FRONTEND_BASE_URL}/artiste/daft-punk" />`
      );
    }
  });

  it('describes the artist as a schema.org MusicGroup, tied to Wikipedia', async () => {
    mockShell();

    const html = await (await app.handle(new Request('http://localhost/artiste/daft-punk'))).text();

    expect(jsonLd(html)).toEqual({
      '@context': 'https://schema.org',
      '@type': 'MusicGroup',
      name: 'Daft Punk',
      url: `${env.FRONTEND_BASE_URL}/artiste/daft-punk`,
      image: 'https://cdn-images.dzcdn.net/images/artist/dp.jpg',
      description: 'Un duo français.',
      sameAs: ['https://fr.wikipedia.org/wiki/Daft_Punk'],
    });
  });

  it('keeps a name holding </script> inside the JSON-LD', async () => {
    mockShell();
    profileName = 'X</script><script>alert(1)</script>';

    const html = await (await app.handle(new Request('http://localhost/artiste/daft-punk'))).text();

    expect(html).toContain('X\\u003c/script>');
    expect(jsonLd(html).name).toBe(profileName);
  });

  it('keeps the default share image when the artist image is not on an allowed host', async () => {
    mockShell();
    profileImage = 'https://evil.example/pwn.jpg';

    const res = await app.handle(new Request('http://localhost/artiste/daft-punk'));

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

    const res = await app.handle(new Request('http://localhost/artiste/daft-punk'));

    expect(await res.text()).not.toContain('http://cdn-images.dzcdn.net');
  });

  it('answers a malformed slug like an unknown artist, without a lookup', async () => {
    mockShell();
    profileSpy.mockClear();

    const res = await app.handle(new Request('http://localhost/en/artist/daft_punk'));

    expect(res.status).toBe(404);
    expect(await res.text()).toBe(SHELL);
    expect(profileSpy).not.toHaveBeenCalled();
  });

  it('serves the English page under /en/ with its own url, language and fallback text', async () => {
    mockShell();
    profileImage = null;

    const res = await app.handle(new Request('http://localhost/en/artist/daft-punk'));

    const html = await res.text();
    expect(html).toContain('<html lang="en">');
    expect(html).toContain(`href="${env.FRONTEND_BASE_URL}/en/artist/daft-punk"`);
    expect(html).toContain('<meta property="og:locale" content="en_GB" />');
    expect(html).toContain(
      '<meta property="og:image" content="https://aubesonore.fr/og-en.png" />'
    );
    expect(html).toContain(
      '<meta name="twitter:image" content="https://aubesonore.fr/og-en.png" />'
    );
  });

  it("sends an MBID the antenna played to the artist's slug", async () => {
    mockShell();

    const res = await app.handle(new Request(`http://localhost/artiste/${DAFT_PUNK_MBID}`));

    expect(res.status).toBe(301);
    expect(res.headers.get('location')).toBe('/artiste/daft-punk');
  });

  it('serves the page of an artist never played at its MBID, kept out of search results', async () => {
    mockShell();

    const res = await app.handle(new Request(`http://localhost/artiste/${UNPLAYED_MBID}`));
    const html = await res.text();

    expect(res.status).toBe(200);
    expect(res.headers.get('x-robots-tag')).toBe('noindex');
    expect(html).toContain(
      `<link rel="canonical" href="${env.FRONTEND_BASE_URL}/artiste/${UNPLAYED_MBID}"`
    );
    expect(html).toContain('Protomartyr sur AubeSonore, radio de découverte musicale.');
    expect(html).not.toContain('hreflang');
    expect(jsonLd(html).sameAs).toEqual([`https://musicbrainz.org/artist/${UNPLAYED_MBID}`]);
  });

  it('answers 503 while Musilogy, which makes a page by MBID, is not loaded', async () => {
    mockShell();

    const res = await app.handle(new Request(`http://localhost/artiste/${NOT_LOADED_MBID}`));

    expect(res.status).toBe(503);
  });

  it('answers 404 with the untouched shell when the artist is unknown', async () => {
    mockShell();

    const res = await app.handle(new Request('http://localhost/artiste/inconnu'));

    expect(res.status).toBe(404);
    expect(await res.text()).toBe(SHELL);
  });
});

describe('the addresses pages had before slugs', () => {
  it.each([
    [`/artist/${VALID_ID}/daft-punk`, '/artiste/daft-punk'],
    [`/artist/${VALID_ID}`, '/artiste/daft-punk'],
    [`/artist/${VALID_ID}/an-old-slug`, '/artiste/daft-punk'],
    [`/en/artist/${VALID_ID}/daft-punk`, '/en/artist/daft-punk'],
    [`/en/artist/${VALID_ID}`, '/en/artist/daft-punk'],
  ])('moves %s permanently to %s', async (from, to) => {
    const res = await app.handle(new Request(`http://localhost${from}`));

    expect(res.status).toBe(301);
    expect(res.headers.get('location')).toBe(to);
  });

  it('answers 404 for an id no artist holds', async () => {
    const res = await app.handle(new Request(`http://localhost/artist/${UNKNOWN_ID}/daft-punk`));

    expect(res.status).toBe(404);
    expect(res.headers.get('location')).toBeNull();
  });

  it('returns 502 when the frontend shell cannot be read', async () => {
    globalThis.fetch = (() =>
      Promise.resolve(new Response(null, { status: 500 }))) as unknown as typeof fetch;

    const res = await app.handle(new Request('http://localhost/artiste/daft-punk'));

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

    await app.handle(new Request('http://localhost/artiste/daft-punk'));
    const res = await app.handle(new Request('http://localhost/artiste/daft-punk'));

    expect(seen).toEqual([null, '"v1"']);
    expect(await res.text()).toContain('Daft Punk · AubeSonore');
  });

  it('serves the new shell as soon as a deploy changes it', async () => {
    let version = 'old';
    globalThis.fetch = (() =>
      Promise.resolve(
        new Response(SHELL.replace('<div id="root">', `<div data-build="${version}" id="root">`), {
          headers: { etag: `"${version}"` },
        })
      )) as unknown as typeof fetch;

    await app.handle(new Request('http://localhost/artiste/daft-punk'));
    version = 'new';
    const res = await app.handle(new Request('http://localhost/artiste/daft-punk'));

    expect(await res.text()).toContain('data-build="new"');
  });

  it('keeps the last shell when the frontend container is briefly unreachable', async () => {
    mockShell();
    await app.handle(new Request('http://localhost/artiste/daft-punk'));
    globalThis.fetch = (() => Promise.reject(new Error('ECONNREFUSED'))) as unknown as typeof fetch;

    const res = await app.handle(new Request('http://localhost/artiste/daft-punk'));

    expect(res.status).toBe(200);
  });

  it('asks browsers to revalidate the page', async () => {
    mockShell();

    const res = await app.handle(new Request('http://localhost/artiste/daft-punk'));

    expect(res.headers.get('cache-control')).toBe('no-cache');
  });
});
