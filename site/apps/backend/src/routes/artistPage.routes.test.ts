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
let musilogyAnswer: unknown = null;
const musilogySpy = spyOn(musilogyService, 'getMusilogyArtist').mockImplementation(() =>
  Promise.resolve(musilogyAnswer as never)
);
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
const discoveredService = await import('../services/discoveredArtists');
let discovered: string[] = [];
const discoveredSpy = spyOn(discoveredService, 'isDiscovered').mockImplementation(
  (mbid: string | null) => mbid !== null && discovered.includes(mbid)
);
const discoveredListSpy = spyOn(discoveredService, 'listDiscovered').mockImplementation(
  () => discovered
);
const slugsSpy = spyOn(pages, 'listArtistSlugs').mockImplementation(() =>
  Promise.resolve(['daft-punk', 'кино'])
);

afterAll(() => {
  profileSpy.mockRestore();
  musilogySpy.mockRestore();
  slugSpy.mockRestore();
  slugsSpy.mockRestore();
  discoveredSpy.mockRestore();
  discoveredListSpy.mockRestore();
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
  musilogyAnswer = null;
  discovered = [];
  renderAnswer = () => Promise.resolve(new Response(null, { status: 503 }));
});

let shellUrl = '';
// The renderer's answer; by default it is down and the page goes out empty, as before it existed.
let renderAnswer: (request: { path: string; data: unknown }) => Promise<Response> = () =>
  Promise.resolve(new Response(null, { status: 503 }));

/** The frontend's shell from `shell`, the renderer's answers from `renderAnswer`. */
function setFetch(shell: (input: string, init?: RequestInit) => Promise<Response>): void {
  globalThis.fetch = ((input: string | URL, init?: RequestInit) =>
    String(input).endsWith('/render')
      ? renderAnswer(
          JSON.parse(typeof init?.body === 'string' ? init.body : 'null') as {
            path: string;
            data: unknown;
          }
        )
      : shell(String(input), init)) as unknown as typeof fetch;
}

function mockShell(): void {
  setFetch((input) => {
    shellUrl = input;
    return Promise.resolve(new Response(SHELL, { headers: { 'content-type': 'text/html' } }));
  });
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

  it('offers a page by MBID that passes the threshold to search engines, in both languages', async () => {
    mockShell();
    discovered = [UNPLAYED_MBID];

    const res = await app.handle(new Request(`http://localhost/artiste/${UNPLAYED_MBID}`));
    const html = await res.text();

    expect(res.headers.get('x-robots-tag')).toBeNull();
    expect(html).toContain(
      `<link rel="alternate" hreflang="en" href="${env.FRONTEND_BASE_URL}/en/artist/${UNPLAYED_MBID}" />`
    );
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
    setFetch(() => Promise.resolve(new Response(null, { status: 500 })));

    const res = await app.handle(new Request('http://localhost/artiste/daft-punk'));

    expect(res.status).toBe(502);
  });

  it('revalidates the shell with its ETag and reuses it on 304', async () => {
    const seen: Array<string | null> = [];
    setFetch((_, init) => {
      const etag = new Headers(init?.headers).get('if-none-match');
      seen.push(etag);
      return Promise.resolve(
        etag === '"v1"'
          ? new Response(null, { status: 304 })
          : new Response(SHELL, { headers: { etag: '"v1"' } })
      );
    });

    await app.handle(new Request('http://localhost/artiste/daft-punk'));
    const res = await app.handle(new Request('http://localhost/artiste/daft-punk'));

    expect(seen).toEqual([null, '"v1"']);
    expect(await res.text()).toContain('Daft Punk · AubeSonore');
  });

  it('serves the new shell as soon as a deploy changes it', async () => {
    let version = 'old';
    setFetch(() =>
      Promise.resolve(
        new Response(SHELL.replace('<div id="root">', `<div data-build="${version}" id="root">`), {
          headers: { etag: `"${version}"` },
        })
      )
    );

    await app.handle(new Request('http://localhost/artiste/daft-punk'));
    version = 'new';
    const res = await app.handle(new Request('http://localhost/artiste/daft-punk'));

    expect(await res.text()).toContain('data-build="new"');
  });

  it('keeps the last shell when the frontend container is briefly unreachable', async () => {
    mockShell();
    await app.handle(new Request('http://localhost/artiste/daft-punk'));
    setFetch(() => Promise.reject(new Error('ECONNREFUSED')));

    const res = await app.handle(new Request('http://localhost/artiste/daft-punk'));

    expect(res.status).toBe(200);
  });

  it("puts the renderer's page in the root, followed by the data it was drawn from", async () => {
    mockShell();
    const asked: Array<{ path: string; data: unknown }> = [];
    renderAnswer = (request) => {
      asked.push(request);
      return Promise.resolve(new Response('<main><h1>Daft Punk</h1></main>'));
    };

    const res = await app.handle(new Request('http://localhost/en/artist/daft-punk'));
    const html = await res.text();

    expect(res.status).toBe(200);
    expect(html).toContain('<div id="root"><main><h1>Daft Punk</h1></main></div>');
    const script = /<script type="application\/json" id="artist-page-data">(.*?)<\/script>/s.exec(
      html
    );
    const data = JSON.parse(script?.[1] ?? 'null') as { locale: string; profile: { slug: string } };
    expect(data.locale).toBe('en');
    expect(data.profile.slug).toBe('daft-punk');
    expect(asked).toEqual([{ path: '/en/artist/daft-punk', data }]);
  });

  it("embeds Musilogy's answer for an artist it knows", async () => {
    mockShell();
    musilogyAnswer = { mbid: UNPLAYED_MBID, card: { name: 'Protomartyr' } };
    const asked: Array<{ data: { musilogy: unknown } }> = [];
    renderAnswer = (request) => {
      asked.push(request as { data: { musilogy: unknown } });
      return Promise.resolve(new Response('<main></main>'));
    };

    await app.handle(new Request(`http://localhost/artiste/${UNPLAYED_MBID}`));

    expect(asked.map((request) => request.data.musilogy)).toEqual([musilogyAnswer]);
  });

  it('keeps a value holding </script> inside the embedded data', async () => {
    mockShell();
    profileName = 'X</script><script>alert(1)</script>';
    renderAnswer = () => Promise.resolve(new Response('<main></main>'));

    const html = await (await app.handle(new Request('http://localhost/artiste/daft-punk'))).text();

    const script = /<script type="application\/json" id="artist-page-data">(.*?)<\/script>/s.exec(
      html
    );
    expect(script?.[1]).toContain('X\\u003c/script>');
    const data = JSON.parse(script?.[1] ?? 'null') as { profile: { name: string } };
    expect(data.profile.name).toBe(profileName);
  });

  it('sends the empty shell when the renderer fails or is too slow', async () => {
    mockShell();
    renderAnswer = () => Promise.reject(new DOMException('timed out', 'TimeoutError'));

    const res = await app.handle(new Request('http://localhost/artiste/daft-punk'));
    const html = await res.text();

    expect(res.status).toBe(200);
    expect(html).toContain('<div id="root"></div>');
    expect(html).not.toContain('artist-page-data');
  });

  it('asks browsers to revalidate the page', async () => {
    mockShell();

    const res = await app.handle(new Request('http://localhost/artiste/daft-punk'));

    expect(res.headers.get('cache-control')).toBe('no-cache');
  });
});

describe('GET /sitemap-artists.xml', () => {
  it('lists every artist page in both languages, each with its versions', async () => {
    const res = await app.handle(new Request('http://localhost/sitemap-artists.xml'));
    const xml = await res.text();

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/xml; charset=utf-8');
    expect(count(xml, '<url>')).toBe(4);
    const fr = `${env.FRONTEND_BASE_URL}/artiste/%D0%BA%D0%B8%D0%BD%D0%BE`;
    const en = `${env.FRONTEND_BASE_URL}/en/artist/%D0%BA%D0%B8%D0%BD%D0%BE`;
    const versions =
      `<xhtml:link rel="alternate" hreflang="fr" href="${fr}"/>` +
      `<xhtml:link rel="alternate" hreflang="en" href="${en}"/>` +
      `<xhtml:link rel="alternate" hreflang="x-default" href="${fr}"/>`;
    expect(xml).toContain(`<url><loc>${fr}</loc>${versions}</url>`);
    expect(xml).toContain(`<url><loc>${en}</loc>${versions}</url>`);
  });
});

describe('GET /sitemap-artists-discovered.xml', () => {
  it('lists the pages by MBID that pass the threshold, in both languages', async () => {
    discovered = [UNPLAYED_MBID];

    const xml = await (
      await app.handle(new Request('http://localhost/sitemap-artists-discovered.xml'))
    ).text();

    expect(count(xml, '<url>')).toBe(2);
    expect(xml).toContain(`<loc>${env.FRONTEND_BASE_URL}/artiste/${UNPLAYED_MBID}</loc>`);
    expect(xml).toContain(`<loc>${env.FRONTEND_BASE_URL}/en/artist/${UNPLAYED_MBID}</loc>`);
  });
});
