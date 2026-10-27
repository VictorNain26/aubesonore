import { Elysia } from 'elysia';
import { getArtistProfile } from '../services/artistProfileService';
import { MusilogyUnavailable } from '../services/musilogyService';
import { resolveArtist } from '../services/artistResolver';
import { isValidArtistSlug } from '../validators/artistValidator';
import { checkRate, getClientIp, tooManyRequests } from '../lib/rateLimit';

const ARTIST_LIMIT = 10;
const ARTIST_WINDOW_MS = 60_000;
// Walking from artist to artist opens a page every few seconds; a page reads
// the stored profile or Musilogy, the live sources only once, behind caches.
const PAGE_LIMIT = 60;

export const artistRoutes = new Elysia({ prefix: '/api/artist' })
  .get('/resolve', async ({ request, query, set }) => {
    const ip = getClientIp(request.headers);
    if (!checkRate('artist', ip, ARTIST_LIMIT, ARTIST_WINDOW_MS)) {
      return tooManyRequests(set);
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
  .get('/page/:slug', async ({ request, params, query, set }) => {
    const ip = getClientIp(request.headers);
    if (!checkRate('artist-page', ip, PAGE_LIMIT, ARTIST_WINDOW_MS)) {
      return tooManyRequests(set);
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
