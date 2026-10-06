import type { ArtistProfile, MusilogyArtist, SiteLocale } from '@aubesonore/shared-types/client';

/** An artist page drawn by the renderer: the body of #root, and the data the client starts from. */
export interface RenderedPage {
  body: string;
  data: { locale: SiteLocale; profile: ArtistProfile; musilogy: MusilogyArtist | null };
}

/** `<` escaped: a value holding "</script>" cannot close the element. */
function scriptJson(value: unknown): string {
  return JSON.stringify(value).replaceAll('<', '\\u003c');
}

// Only Deezer's CDN may end up in og:image: an attacker-controlled host there
// would let a poisoned profile dictate what social networks display for us.
const ALLOWED_IMAGE_HOSTS = ['cdn-images.dzcdn.net', 'e-cdns-images.dzcdn.net', 'cdn.deezer.com'];

const OG_DESCRIPTION_MAX = 200;

function isAllowedImage(url: string | null): url is string {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && ALLOWED_IMAGE_HOSTS.includes(parsed.hostname);
  } catch {
    return false;
  }
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1).trimEnd()}…`;
}

function isHttps(url: string): boolean {
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * The artist as schema.org reads it: MusicGroup "can also be a solo musician"
 * (https://schema.org/MusicGroup); sameAs ties the page to the same artist on
 * MusicBrainz, Wikipedia and the platforms.
 */
function artistJsonLd(profile: ArtistProfile, pageUrl: string, image: string | null): string {
  const sameAs = [
    ...(profile.mbid ? [`https://musicbrainz.org/artist/${profile.mbid}`] : []),
    ...(profile.summary ? [profile.summary.url] : []),
    ...profile.links.map((link) => link.url),
  ].filter(isHttps);
  const data = {
    '@context': 'https://schema.org',
    '@type': 'MusicGroup',
    name: profile.name,
    url: pageUrl,
    ...(image ? { image } : {}),
    ...(profile.summary ? { description: profile.summary.text } : {}),
    ...(sameAs.length > 0 ? { sameAs } : {}),
    ...(profile.facts?.formed ? { foundingDate: String(profile.facts.formed) } : {}),
    ...(profile.facts?.ended ? { dissolutionDate: String(profile.facts.ended) } : {}),
  };
  return `<script type="application/ld+json">${scriptJson(data)}</script>`;
}

/**
 * Rewrites the site's own head tags in place rather than appending: the shell
 * already carries the home page's canonical, og:url and og:image, and a page
 * that keeps them declares itself a copy of the home page.
 * With a rendered page, #root holds its body and the data it was drawn from
 * follows; without one, the client fills the empty root.
 */
export function renderArtistShell(
  shell: string,
  profile: ArtistProfile,
  pageUrls: Record<SiteLocale, string>,
  locale: SiteLocale,
  page: RenderedPage | null = null
): Promise<string> {
  const pageUrl = pageUrls[locale];
  const title = `${profile.name} · AubeSonore`;
  const description = profile.summary
    ? truncate(profile.summary.text, OG_DESCRIPTION_MAX)
    : locale === 'en'
      ? `${profile.name}${profile.played ? ', played' : ''} on AubeSonore, a music discovery radio.`
      : `${profile.name}${profile.played ? ', passé' : ''} sur AubeSonore, radio de découverte musicale.`;
  const image = isAllowedImage(profile.image) ? profile.image : null;

  const content: Record<string, string> = {
    'meta[name="description"]': description,
    'meta[property="og:title"]': title,
    'meta[property="og:description"]': description,
    'meta[property="og:url"]': pageUrl,
    'meta[name="twitter:title"]': title,
    'meta[name="twitter:description"]': description,
    // The same values as the pre-rendered home pages (scripts/prerender.mjs).
    'meta[property="og:locale"]': locale === 'en' ? 'en_GB' : 'fr_FR',
  };
  if (image) {
    content['meta[property="og:image"]'] = image;
    content['meta[name="twitter:image"]'] = image;
    content['meta[property="og:image:alt"]'] = profile.name;
  }

  // setInnerContent encodes text. setAttribute encodes `"` but passes `&`
  // through (measured on Bun 1.3.14), so `&` is encoded first: a name cannot
  // leave its attribute, and "AT&amp;T" is not decoded by the browser.
  let rewriter = new HTMLRewriter()
    .on('html', {
      element(element) {
        element.setAttribute('lang', locale);
      },
    })
    .on('title', {
      element(element) {
        element.setInnerContent(title);
      },
    })
    .on('link[rel="canonical"]', {
      element(element) {
        element.setAttribute('href', pageUrl.replaceAll('&', '&amp;'));
        // Each language lists both, itself included, French by default
        // (https://developers.google.com/search/docs/specialty/international/localized-versions).
        // A page kept out of search results has no versions to declare.
        if (profile.played) {
          const alternate = (lang: string, url: string) =>
            `<link rel="alternate" hreflang="${lang}" href="${url.replaceAll('&', '&amp;')}" />`;
          element.after(
            [
              alternate('fr', pageUrls.fr),
              alternate('en', pageUrls.en),
              alternate('x-default', pageUrls.fr),
            ].join(''),
            { html: true }
          );
        }
      },
    })
    .on('head', {
      element(element) {
        element.append(artistJsonLd(profile, pageUrl, image), { html: true });
      },
    });
  for (const [selector, value] of Object.entries(content)) {
    rewriter = rewriter.on(selector, {
      element(element) {
        element.setAttribute('content', value.replaceAll('&', '&amp;'));
      },
    });
  }
  // The id matches ARTIST_PAGE_DATA_ID in apps/frontend/src/lib/artistPageData.ts.
  if (page) {
    rewriter = rewriter.on('div#root', {
      element(element) {
        element.setInnerContent(page.body, { html: true });
        element.after(
          `<script type="application/json" id="artist-page-data">${scriptJson(page.data)}</script>`,
          { html: true }
        );
      },
    });
  }
  // No portrait: the default share image, in the page language like the
  // pre-rendered home pages (scripts/prerender.mjs swaps og-fr for og-en).
  if (!image && locale === 'en') {
    rewriter = rewriter.on('meta[property="og:image"], meta[name="twitter:image"]', {
      element(element) {
        const value = element.getAttribute('content');
        if (value) element.setAttribute('content', value.replace('/og-fr.png', '/og-en.png'));
      },
    });
  }
  // The declared size belongs to the default share image, not to the artist's.
  if (image) {
    rewriter = rewriter.on('meta[property="og:image:width"], meta[property="og:image:height"]', {
      element(element) {
        element.remove();
      },
    });
  }

  return rewriter
    .transform(new Response(shell, { headers: { 'content-type': 'text/html' } }))
    .text();
}
