import type { ArtistProfile, MusilogyArtist, SiteLocale } from '@aubesonore/shared-types/client';
import { artistDescription, artistTitle } from './artistMeta';

/** An artist page drawn by the renderer: the body of #root, and the data the client starts from. */
export interface RenderedPage {
  body: string;
  data: { locale: SiteLocale; profile: ArtistProfile; musilogy: MusilogyArtist | null };
}

/** `<` escaped: a value holding "</script>" cannot close the element. */
function scriptJson(value: unknown): string {
  return JSON.stringify(value).replaceAll('<', '\\u003c');
}

// Only the Cover Art Archive may end up in og:image: an attacker-controlled
// host there would let a poisoned profile dictate what social networks display
// for us. A Commons photo stays out: a link preview cannot carry the credit its
// licence asks for (docs/vision.md §2.5).
const ALLOWED_IMAGE_HOSTS = ['coverartarchive.org'];

function isAllowedImage(url: string | null): url is string {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && ALLOWED_IMAGE_HOSTS.includes(parsed.hostname);
  } catch {
    return false;
  }
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
  musilogy: MusilogyArtist | null,
  page: RenderedPage | null = null,
  indexable = profile.played
): Promise<string> {
  const pageUrl = pageUrls[locale];
  const title = artistTitle(profile, musilogy, locale);
  const description = artistDescription(profile, musilogy, locale);
  const cover = profile.images.find((image) => image.kind === 'cover')?.url ?? null;
  const image = isAllowedImage(cover) ? cover : null;

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
        if (indexable) {
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

// The frontend's not-found page says the same (message notfound_meta_title).
const NOT_FOUND_TITLE: Record<SiteLocale, string> = {
  fr: 'Page introuvable · AubeSonore',
  en: 'Page not found · AubeSonore',
};

/**
 * The shell of an unknown artist's 404, in the page's language: it says the page is not found
 * and stays out of search results. The home page's canonical, og:url and description go: kept,
 * they would declare the 404 a copy of the home page. The client draws the not-found screen.
 */
export function renderMissingShell(shell: string, locale: SiteLocale): Promise<string> {
  const title = NOT_FOUND_TITLE[locale];
  return new HTMLRewriter()
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
    .on('meta[property="og:title"], meta[name="twitter:title"]', {
      element(element) {
        element.setAttribute('content', title);
      },
    })
    .on('link[rel="canonical"]', {
      element(element) {
        element.replace('<meta name="robots" content="noindex" />', { html: true });
      },
    })
    .on(
      'meta[property="og:url"], meta[name="description"], meta[property="og:description"], meta[name="twitter:description"]',
      {
        element(element) {
          element.remove();
        },
      }
    )
    .transform(new Response(shell, { headers: { 'content-type': 'text/html' } }))
    .text();
}
