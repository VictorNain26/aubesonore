import { Elysia } from 'elysia';
import { validateBody } from '../lib/validate';
import { hasError } from '../lib/routeHelpers';
import { likeTrackSchema } from '../validators/trackValidator';
import * as trackService from '../services/trackService';
import type { LikedTrackListItem, ServiceResponse } from '../services/trackService';
import { auth } from '../lib/auth/index';
import { checkRate, tooManyRequests } from '../lib/rateLimit';
import type { User, Session } from '../db/schema';

// ─────────────────────────────────────────────
// Routes /api/track
// ─────────────────────────────────────────────

// Per-user cap on mutations that fan out to external services (the iTunes
// cover, the YouTube lookup). Generous enough to never touch real usage.
const TRACK_MUTATION_LIMIT = 60;
const TRACK_MUTATION_WINDOW_MS = 60_000;

export const trackRoutes = new Elysia({ prefix: '/api/track' })
  // The session, when the request carries one.
  .derive(async ({ request: { headers } }): Promise<{ user?: User; session?: Session }> => {
    const sessionData = await auth.api.getSession({ headers });
    if (!sessionData) {
      return {};
    }
    return { user: sessionData.user as User, session: sessionData.session as Session };
  })

  // ─────────────────────────────────────────────
  // POST /api/track/like: keep a track
  // ─────────────────────────────────────────────
  .post('/like', async ({ user, body, set }): Promise<ServiceResponse> => {
    if (!user) {
      set.status = 401;
      return { error: 'Non authentifié' };
    }

    if (
      !checkRate(
        'track-mutation',
        `user:${user.id}`,
        TRACK_MUTATION_LIMIT,
        TRACK_MUTATION_WINDOW_MS
      )
    ) {
      return tooManyRequests(set);
    }

    const data = validateBody(likeTrackSchema, body);
    if (hasError(data)) {
      set.status = 400;
      return data;
    }

    // Build request with only defined optional fields
    const requestBody = {
      title: data.title,
      artist: data.artist,
      youtubeUrl: data.youtubeUrl,
      ...(data.album !== undefined && { album: data.album }),
      ...(data.artworkUrl !== undefined && { artworkUrl: data.artworkUrl }),
      ...(data.isrc !== undefined && { isrc: data.isrc }),
    };
    const { status, ...answer } = await trackService.likeTrack({ user, body: requestBody });
    if (answer.error) set.status = status ?? 400;
    return answer;
  })

  // ─────────────────────────────────────────────
  // GET /api/track/like: the kept tracks
  // ─────────────────────────────────────────────
  .get('/like', async ({ user, set }): Promise<LikedTrackListItem[] | { error: string }> => {
    if (!user) {
      set.status = 401;
      return { error: 'Non authentifié' };
    }
    return trackService.getLikedTracks({ user });
  })

  // ─────────────────────────────────────────────
  // DELETE /api/track/like/:trackId: stop keeping a track
  // ─────────────────────────────────────────────
  .delete('/like/:trackId', async ({ user, params, set }): Promise<ServiceResponse> => {
    if (!user) {
      set.status = 401;
      return { error: 'Non authentifié' };
    }

    const { status, ...answer } = await trackService.unlikeTrack({ user, id: params.trackId });
    if (answer.error) set.status = status ?? 400;
    return answer;
  });
