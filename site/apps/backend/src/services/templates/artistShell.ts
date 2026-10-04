import type { ArtistProfile, SiteLocale } from '@aubesonore/shared-types/client';

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

/**
 * Rewrites the site's own head tags in place rather than appending: the shell
 * already carries the home page's canonical, og:url and og:image, and a page
 * that keeps them declares itself a copy of the home page.
 */
export function renderArtistShell(
  shell: string,
  profile: ArtistProfile,
  pageUrl: string,
  locale: SiteLocale
): Promise<string> {
  const title = `${profile.name} · AubeSonore`;
  const description = profile.summary
    ? truncate(profile.summary.text, OG_DESCRIPTION_MAX)
    : locale === 'en'
      ? `${profile.name}, played on AubeSonore, a music discovery radio.`
      : `${profile.name}, passé sur AubeSonore, radio de découverte musicale.`;
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
      },
    });
  for (const [selector, value] of Object.entries(content)) {
    rewriter = rewriter.on(selector, {
      element(element) {
        element.setAttribute('content', value.replaceAll('&', '&amp;'));
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
