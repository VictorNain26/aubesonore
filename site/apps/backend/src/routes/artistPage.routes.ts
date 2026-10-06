import type { SiteLocale } from '@aubesonore/shared-types/client';
import { Elysia } from 'elysia';
import { env } from '../config/env';
import { logger } from '../lib/logger';
import { checkRate, getClientIp } from '../lib/rateLimit';
import { getArtistProfile, isMbid } from '../services/artistProfileService';
import { MusilogyUnavailable } from '../services/musilogyService';
import { listArtistSlugs, slugOfArtist } from '../services/artistPages';
import { renderArtistShell } from '../services/templates/artistShell';
import { isValidArtistId, isValidArtistSlug } from '../validators/artistValidator';

// Higher than the JSON budget: this is a document route, and a single visit
// pulls one page rather than a burst of API calls.
const PAGE_LIMIT = 60;
const PAGE_WINDOW_MS = 60_000;
const SHELL_TIMEOUT_MS = 3_000;

let shell: { html: string; etag: string | null } | null = null;

/**
 * Revalidated on every request (If-None-Match, a 304 from nginx): a shell kept
 * past a frontend deploy would point at hashed assets that no longer exist.
 */
async function loadShell(): Promise<string | null> {
  try {
    // app.html is the build's empty shell; index.html is the pre-rendered home
    // page, which the client would hydrate as the home page.
    const response = await fetch(`${env.FRONTEND_ORIGIN_INTERNAL}/app.html`, {
      headers: shell?.etag ? { 'if-none-match': shell.etag } : {},
      signal: AbortSignal.timeout(SHELL_TIMEOUT_MS),
    });
    if (response.status === 304 && shell) return shell.html;
    if (!response.ok) {
      logger.warn('artistPage.shell_unavailable', { status: response.status });
      return shell?.html ?? null;
    }
    shell = { html: await response.text(), etag: response.headers.get('etag') };
    return shell.html;
  } catch (err) {
    logger.warn('artistPage.shell_unavailable', { message: (err as Error).message });
    return shell?.html ?? null;
  }
}

/** Test seam: the shell is module state and would leak between tests. */
export function __resetArtistShell(): void {
  shell = null;
}

interface HandlerContext {
  request: Request;
  params: { slug: string };
  set: { status?: number | string; headers: Record<string, string | number> };
}

/** The page path of an artist: /artiste/<slug> in French, /en/artist/<slug> in English. */
export function artistPagePath(locale: SiteLocale, slug: string): string {
  return `${locale === 'en' ? '/en/artist' : '/artiste'}/${encodeURIComponent(slug)}`;
}

async function handle(
  locale: SiteLocale,
  { request, params, set }: HandlerContext
): Promise<string> {
  const ip = getClientIp(request.headers);
  if (!checkRate('artistPage', ip, PAGE_LIMIT, PAGE_WINDOW_MS)) {
    set.status = 429;
    set.headers['retry-after'] = '60';
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
    return html;
  }
  // An artist the antenna played has one address, its slug.
  if (isMbid(params.slug) && profile.played) {
    set.status = 301;
    set.headers.location = artistPagePath(locale, profile.slug);
    return '';
  }
  // A page by MBID stays out of search results until the richness threshold
  // decides which earn a slug (docs/vision.md §7, step 7.5).
  if (!profile.played) set.headers['x-robots-tag'] = 'noindex';

  const pageUrl = `${env.FRONTEND_BASE_URL}${artistPagePath(locale, profile.slug)}`;
  return renderArtistShell(html, profile, pageUrl, locale);
}

type ResponseSet = HandlerContext['set'];

/**
 * Every artist page, in French and in English, each with its versions, as the
 * site's own sitemap.xml lists the home pages
 * (https://developers.google.com/search/docs/specialty/international/localized-versions#sitemap).
 * A slug is percent-encoded by artistPagePath: nothing in it needs escaping in XML.
 */
export function artistSitemap(slugs: readonly string[]): string {
  const entries = slugs.flatMap((slug) => {
    const fr = `${env.FRONTEND_BASE_URL}${artistPagePath('fr', slug)}`;
    const en = `${env.FRONTEND_BASE_URL}${artistPagePath('en', slug)}`;
    const versions = [
      `<xhtml:link rel="alternate" hreflang="fr" href="${fr}"/>`,
      `<xhtml:link rel="alternate" hreflang="en" href="${en}"/>`,
      `<xhtml:link rel="alternate" hreflang="x-default" href="${fr}"/>`,
    ].join('');
    return [fr, en].map((loc) => `<url><loc>${loc}</loc>${versions}</url>`);
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${entries.join('\n')}
</urlset>
`;
}

async function sitemap({ request, set }: { request: Request; set: ResponseSet }) {
  if (!checkRate('artistSitemap', getClientIp(request.headers), PAGE_LIMIT, PAGE_WINDOW_MS)) {
    set.status = 429;
    set.headers['retry-after'] = '60';
    return 'Too many requests, retry in 1 minute';
  }
  set.headers['content-type'] = 'application/xml; charset=utf-8';
  set.headers['cache-control'] = 'public, max-age=3600';
  return artistSitemap(await listArtistSlugs());
}

/**
 * The addresses pages had before slugs (/artist/<id>/<slug>), still in shares
 * and search results: a permanent redirect hands them to the page's address.
 */
async function legacy(locale: SiteLocale, id: string, set: ResponseSet): Promise<string> {
  const slug = isValidArtistId(id) ? await slugOfArtist(id) : null;
  if (!slug) {
    set.status = 404;
    return locale === 'en' ? 'Artist not found' : 'Artiste introuvable';
  }
  set.status = 301;
  set.headers.location = artistPagePath(locale, slug);
  return '';
}

/** /en/artist/<x> is an old address when <x> is an artist id, the page of slug <x> otherwise. */
async function english(context: HandlerContext): Promise<string> {
  return isValidArtistId(context.params.slug)
    ? legacy('en', context.params.slug, context.set)
    : handle('en', context);
}

// The router wants one parameter name per position: the English old address
// carries its id in `slug`.
export const artistPageRoutes = new Elysia()
  .get('/sitemap-artists.xml', sitemap)
  .get('/artiste/:slug', (context) => handle('fr', context))
  .get('/en/artist/:slug', english)
  .get('/en/artist/:slug/:old', ({ params, set }) => legacy('en', params.slug, set))
  .get('/artist/:id', ({ params, set }) => legacy('fr', params.id, set))
  .get('/artist/:id/:old', ({ params, set }) => legacy('fr', params.id, set));
