import { Elysia } from 'elysia';
import { getArtistProfile } from '../services/artistProfileService';
import { MusilogyUnavailable } from '../services/musilogyService';
import { resolveArtist } from '../services/artistResolver';
import { findArtistPages } from '../services/artistPages';
import { artistPagesSchema, isValidArtistSlug } from '../validators/artistValidator';
import { checkRate, getClientIp } from '../lib/rateLimit';
import { validateBody } from '../lib/validate';
import { hasError } from '../lib/routeHelpers';

const ARTIST_LIMIT = 10;
const ARTIST_WINDOW_MS = 60_000;
// Walking from artist to artist opens a page every few seconds; a page reads
// the stored profile or Musilogy, the live sources only once, behind caches.
const PAGE_LIMIT = 60;
// One request per page load and one per new track: a DB read, no upstream call.
const PAGES_LIMIT = 30;

export const artistRoutes = new Elysia({ prefix: '/api/artist' })
  .get('/resolve', async ({ request, query, set }) => {
    const ip = getClientIp(request.headers);
    if (!checkRate('artist', ip, ARTIST_LIMIT, ARTIST_WINDOW_MS)) {
      set.status = 429;
      set.headers['retry-after'] = '60';
      return { error: 'Trop de requêtes, réessayez dans 1 minute' };
    }

    const name = typeof query?.name === 'string' ? query.name.trim() : '';
    if (!name) {
      set.status = 400;
      return { error: 'Paramètre "name" requis' };
    }

    const resolved = await resolveArtist(name);
    if (!resolved) {
      set.status = 404;
      return { error: 'Artiste non trouvé' };
    }

    return resolved;
  })
  // POST for a read: the thread sends a whole day of names, too long for a URL.
  .post('/pages', async ({ request, body, set }) => {
    const ip = getClientIp(request.headers);
    if (!checkRate('artist-pages', ip, PAGES_LIMIT, ARTIST_WINDOW_MS)) {
      set.status = 429;
      set.headers['retry-after'] = '60';
      return { error: 'Trop de requêtes, réessayez dans 1 minute' };
    }

    const data = validateBody(artistPagesSchema, body);
    if (hasError(data)) {
      set.status = 400;
      return data;
    }

    return findArtistPages(data.names);
  })
  .get('/page/:slug', async ({ request, params, query, set }) => {
    const ip = getClientIp(request.headers);
    if (!checkRate('artist-page', ip, PAGE_LIMIT, ARTIST_WINDOW_MS)) {
      set.status = 429;
      set.headers['retry-after'] = '60';
      return { error: 'Trop de requêtes, réessayez dans 1 minute' };
    }

    if (!isValidArtistSlug(params.slug)) {
      set.status = 400;
      return { error: 'Identifiant invalide' };
    }

    const lang = query?.lang ?? 'fr';
    if (lang !== 'fr' && lang !== 'en') {
      set.status = 400;
      return { error: 'Langue invalide' };
    }

    let profile;
    try {
      profile = await getArtistProfile(params.slug, lang);
    } catch (err) {
      // An artist page by MBID is made from Musilogy: unknown until it is loaded.
      if (!(err instanceof MusilogyUnavailable)) throw err;
      set.status = 503;
      return { error: 'Page indisponible pour le moment' };
    }
    if (!profile) {
      set.status = 404;
      return { error: 'Artiste non trouvé' };
    }

    return profile;
  });
