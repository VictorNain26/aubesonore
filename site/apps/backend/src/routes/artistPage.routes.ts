import type { SiteLocale } from '@aubesonore/shared-types/client';
import { Elysia } from 'elysia';
import { env } from '../config/env';
import { checkRate, getClientIp, tooManyRequests } from '../lib/rateLimit';
import { getArtistProfile } from '../services/artistProfileService';
import { getMusilogyArtist, MusilogyUnavailable } from '../services/musilogyService';
import { listArtistSlugs } from '../services/artistPages';
import { slugOfArtistPage } from '../services/artistSlugs';
import { isDiscovered, listDiscoveredPages } from '../services/discoveredArtists';
import { renderArtistShell, renderMissingShell } from '../services/templates/artistShell';
import { artistPagePath, artistSitemap, loadShell, renderPage } from '../services/artistPageRender';
import { isValidArtistId, isValidArtistSlug } from '../validators/artistValidator';

// Higher than the JSON budget: this is a document route, and a single visit
// pulls one page rather than a burst of API calls.
const PAGE_LIMIT = 60;
const PAGE_WINDOW_MS = 60_000;
interface HandlerContext {
  request: Request;
  params: { slug: string };
  set: { status?: number | string; headers: Record<string, string | number> };
}

async function handle(
  locale: SiteLocale,
  { request, params, set }: HandlerContext
): Promise<string> {
  const ip = getClientIp(request.headers);
  if (!checkRate('artist-page-html', ip, PAGE_LIMIT, PAGE_WINDOW_MS)) {
    tooManyRequests(set);
    return locale === 'en'
      ? 'Too many requests, retry in 1 minute'
      : 'Trop de requêtes, réessayez dans 1 minute';
  }

  const html = await loadShell();
  if (!html) {
    set.status = 502;
    return locale === 'en' ? 'Site unavailable' : 'Application indisponible';
  }

  set.headers['content-type'] = 'text/html; charset=utf-8';
  // Like every HTML page of the site (nginx.conf): revalidate, or a deploy
  // leaves browsers on a page whose hashed assets are gone.
  set.headers['cache-control'] = 'no-cache';

  // A malformed slug (a truncated link) is an unknown artist: no lookup.
  let profile;
  try {
    profile = isValidArtistSlug(params.slug) ? await getArtistProfile(params.slug, locale) : null;
  } catch (err) {
    // A page by MBID is made from Musilogy: while it is not loaded, the SPA
    // says the page is unavailable.
    if (!(err instanceof MusilogyUnavailable)) throw err;
    set.status = 503;
    return html;
  }
  // Unknown artist: a real 404, or crawlers index it as a soft 404. The SPA
  // still boots and renders its own not-found state.
  if (!profile) {
    set.status = 404;
    return renderMissingShell(html, locale);
  }
  // A page has one address: its slug, played on the antenna or not, its MBID while it has none.
  // Its MBID, or a row's older slug, leads there.
  if (profile.slug !== params.slug) {
    set.status = 301;
    set.headers.location = artistPagePath(locale, profile.slug);
    return '';
  }
  // A page by MBID stays out of search results unless it passes the
  // threshold (services/discoveredArtists.ts, docs/vision.md §2.4).
  const indexable = profile.played || isDiscovered(profile.mbid);
  if (!indexable) set.headers['x-robots-tag'] = 'noindex';

  const pageUrls = {
    fr: `${env.FRONTEND_BASE_URL}${artistPagePath('fr', profile.slug)}`,
    en: `${env.FRONTEND_BASE_URL}${artistPagePath('en', profile.slug)}`,
  };
  // Unknown to the dump, or Musilogy not loaded: the page shows without its sections.
  const musilogy = profile.mbid ? await getMusilogyArtist(profile.mbid).catch(() => null) : null;
  const page = await renderPage(locale, artistPagePath(locale, profile.slug), profile, musilogy);
  return renderArtistShell(html, profile, pageUrls, locale, musilogy, page, indexable);
}

type ResponseSet = HandlerContext['set'];

/** A sitemap of the pages `list` gives, at their address: their slug, or their MBID without one. */
function sitemapOf(list: () => string[] | Promise<string[]>) {
  return async ({ request, set }: { request: Request; set: ResponseSet }) => {
    if (!checkRate('artist-sitemap', getClientIp(request.headers), PAGE_LIMIT, PAGE_WINDOW_MS)) {
      tooManyRequests(set);
      return 'Too many requests, retry in 1 minute';
    }
    set.headers['content-type'] = 'application/xml; charset=utf-8';
    set.headers['cache-control'] = 'public, max-age=3600';
    return artistSitemap(await list());
  };
}

/**
 * The addresses pages had before slugs (/artist/<id>/<slug>), still in shares
 * and search results: a permanent redirect hands them to the page's address.
 */
async function legacy(locale: SiteLocale, id: string, set: ResponseSet): Promise<string> {
  const slug = isValidArtistId(id) ? await slugOfArtistPage(id) : null;
  if (!slug) {
    set.status = 404;
    return locale === 'en' ? 'Artist not found' : 'Artiste introuvable';
  }
  set.status = 301;
  set.headers.location = artistPagePath(locale, slug);
  return '';
}

/**
 * /en/artist/<x> is an old address when <x> is an artist id, the page of slug <x> otherwise. An
 * MBID is a UUID too: one no artist id matches is the page by MBID.
 */
async function english(context: HandlerContext): Promise<string> {
  const { params, set } = context;
  const slug = isValidArtistId(params.slug) ? await slugOfArtistPage(params.slug) : null;
  if (!slug) return handle('en', context);
  set.status = 301;
  set.headers.location = artistPagePath('en', slug);
  return '';
}

// The router wants one parameter name per position: the English old address
// carries its id in `slug`.
export const artistPageRoutes = new Elysia()
  .get('/sitemap-artists.xml', sitemapOf(listArtistSlugs))
  // Its own file: Search Console reports how these pages fare apart from the played ones.
  .get('/sitemap-artists-discovered.xml', sitemapOf(listDiscoveredPages))
  .get('/artiste/:slug', (context) => handle('fr', context))
  .get('/en/artist/:slug', english)
  .get('/en/artist/:slug/:old', ({ params, set }) => legacy('en', params.slug, set))
  .get('/artist/:id', ({ params, set }) => legacy('fr', params.id, set))
  .get('/artist/:id/:old', ({ params, set }) => legacy('fr', params.id, set));
