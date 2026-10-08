import { Elysia } from 'elysia';
import { checkRate, getClientIp, tooManyRequests } from '../lib/rateLimit';
import { logger } from '../lib/logger';
import {
  getMusilogyArtist,
  MusilogyUnavailable,
  searchMusilogy,
} from '../services/musilogyService';
import { parseMbid, parseSearchQuery } from '../validators/musilogyValidator';

const WINDOW_MS = 60_000;
// Walking from artist to artist asks one page per click; a search, one per pause in typing.
const LIMITS = { artist: 120, search: 60 } as const;
const UNAVAILABLE = { error: "Musilogy n'est pas disponible pour l'instant" };

function limited(bucket: keyof typeof LIMITS, request: Request): boolean {
  return !checkRate(`musilogy:${bucket}`, getClientIp(request.headers), LIMITS[bucket], WINDOW_MS);
}

function unavailable(err: unknown, set: { status?: number | string }) {
  if (!(err instanceof MusilogyUnavailable)) throw err;
  logger.warn('musilogy.not_loaded', { code: err.message });
  set.status = 503;
  return UNAVAILABLE;
}

export const musilogyRoutes = new Elysia({ prefix: '/api/musilogy' })
  .get('/search', async ({ request, query, set }) => {
    if (limited('search', request)) {
      return tooManyRequests(set);
    }
    const q = parseSearchQuery(query?.q);
    if (q === null) {
      set.status = 400;
      return { error: 'Paramètre "q" requis (2 à 100 caractères)' };
    }
    try {
      return await searchMusilogy(q);
    } catch (err) {
      return unavailable(err, set);
    }
  })
  .get('/artist/:mbid', async ({ request, params, set }) => {
    if (limited('artist', request)) {
      return tooManyRequests(set);
    }
    const mbid = parseMbid(params.mbid);
    if (mbid === null) {
      set.status = 400;
      return { error: 'Identifiant MusicBrainz invalide' };
    }
    try {
      const found = await getMusilogyArtist(mbid);
      if (!found) {
        set.status = 404;
        return { error: 'Artiste inconnu de Musilogy' };
      }
      return found;
    } catch (err) {
      return unavailable(err, set);
    }
  });
