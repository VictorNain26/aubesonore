import type { ArtistProfile, MusilogyArtist, SiteLocale } from '@aubesonore/shared-types/client';
import { env } from '../config/env';
import { logger } from '../lib/logger';
import type { RenderedPage } from './templates/artistShell';

// What an artist page is made of besides its data: the build's empty shell, the renderer's body,
// and the sitemap listing the pages (routes/artistPage.routes.ts serves them).

const SHELL_TIMEOUT_MS = 3_000;
// Past this, the page goes out empty and the client fills it, as before the server render.
const RENDER_TIMEOUT_MS = 300;

let shell: { html: string; etag: string | null } | null = null;

/**
 * Revalidated on every request (If-None-Match, a 304 from nginx): a shell kept
 * past a frontend deploy would point at hashed assets that no longer exist.
 */
export async function loadShell(): Promise<string | null> {
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

/**
 * The page's body from the renderer, with the data it was drawn from, which the client starts
 * from. null on any failure: the empty shell still works, the client fills it.
 */
export async function renderPage(
  locale: SiteLocale,
  path: string,
  profile: ArtistProfile,
  musilogy: MusilogyArtist | null
): Promise<RenderedPage | null> {
  try {
    const data = { locale, profile, musilogy };
    const response = await fetch(`${env.RENDERER_ORIGIN_INTERNAL}/render`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path, data }),
      signal: AbortSignal.timeout(RENDER_TIMEOUT_MS),
    });
    if (!response.ok) {
      logger.warn('artistPage.render_failed', { status: response.status });
      return null;
    }
    return { body: await response.text(), data };
  } catch (err) {
    logger.warn('artistPage.render_unavailable', { message: (err as Error).message });
    return null;
  }
}

/** The page path of an artist: /artiste/<slug> in French, /en/artist/<slug> in English. */
export function artistPagePath(locale: SiteLocale, slug: string): string {
  return `${locale === 'en' ? '/en/artist' : '/artiste'}/${encodeURIComponent(slug)}`;
}

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
