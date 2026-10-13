import { Elysia } from 'elysia';
import { checkRate, getClientIp, tooManyRequests } from '../lib/rateLimit';
import { logger } from '../lib/logger';
import { findTrackLinks } from '../services/trackLinksService';
import { renderSharePage } from '../services/templates/sharePage';
import { requestLocale } from '../lib/locale';

const SHARE_LIMIT = 30;
const SHARE_WINDOW_MS = 60_000;

// The page ships an inline <style> and remote https covers but no JS.
const SHARE_PAGE_CSP = "default-src 'self'; img-src https:; style-src 'unsafe-inline'";

// Public track share page (no /api prefix): the URL is what listeners paste
// into chats/social networks, so it must be short and readable by crawlers.
export const shareRoutes = new Elysia().get('/t', async ({ request, query, set }) => {
  const ip = getClientIp(request.headers);
  if (!checkRate('share', ip, SHARE_LIMIT, SHARE_WINDOW_MS)) {
    return tooManyRequests(set);
  }

  const title = typeof query.title === 'string' ? query.title.trim() : '';
  const artist = typeof query.artist === 'string' ? query.artist.trim() : '';
  if (!title || !artist) {
    set.status = 400;
    return { error: 'Paramètres "artist" et "title" requis' };
  }

  let links = null;
  try {
    links = await findTrackLinks(title, artist);
  } catch (error) {
    // A platform failing: the page renders without its cover or links.
    logger.warn('share.links_failed', {
      title,
      artist,
      message: error instanceof Error ? error.message : String(error),
    });
  }

  // The sharer's language, carried by the link (lang=); an older link without it, the reader's.
  const locale =
    query.lang === 'en' || query.lang === 'fr'
      ? query.lang
      : requestLocale(request.headers.get('accept-language'));
  const shareUrl = `${new URL(request.url).origin}/t?artist=${encodeURIComponent(artist)}&title=${encodeURIComponent(title)}&lang=${locale}`;

  set.headers['content-type'] = 'text/html; charset=utf-8';
  set.headers['cache-control'] = 'public, max-age=3600';
  set.headers['vary'] = 'accept-language';
  // Same casing as applySecurityHeaders: its `??=` guard matches this exact
  // key, a different one would ship two merged CSP values.
  set.headers['Content-Security-Policy'] = SHARE_PAGE_CSP;
  return renderSharePage({ title, artist, shareUrl, links, locale });
});
