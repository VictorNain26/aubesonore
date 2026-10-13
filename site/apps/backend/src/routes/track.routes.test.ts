import { afterAll, afterEach, describe, expect, it, spyOn } from 'bun:test';

const { auth } = await import('../lib/auth/index');
const trackService = await import('../services/trackService');
const { trackRoutes } = await import('./track.routes');
const { __resetRateLimits } = await import('../lib/rateLimit');

let signedIn = true;
const sessionSpy = spyOn(auth.api, 'getSession').mockImplementation((() =>
  Promise.resolve(
    signedIn
      ? { user: { id: 'user-1', email: 'listener@aubesonore.test' }, session: { id: 's-1' } }
      : null
  )) as never);
const likeSpy = spyOn(trackService, 'likeTrack').mockResolvedValue({
  message: 'Morceau liké avec succès',
});
const unlikeSpy = spyOn(trackService, 'unlikeTrack').mockResolvedValue({
  status: 404,
  error: 'Morceau non trouvé ou déjà supprimé',
});

afterEach(() => {
  signedIn = true;
  __resetRateLimits();
});
afterAll(() => {
  sessionSpy.mockRestore();
  likeSpy.mockRestore();
  unlikeSpy.mockRestore();
});

const like = (body: unknown) =>
  trackRoutes.handle(
    new Request('http://localhost/api/track/like', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  );

describe('POST /api/track/like', () => {
  it('asks a listener who is not signed in to sign in', async () => {
    signedIn = false;
    const res = await like({ title: 'In Flight', artist: 'Sunflower Bean', youtubeUrl: 'x' });
    expect(res.status).toBe(401);
  });

  it('refuses a body that is not a track, saying why', async () => {
    const res = await like({ title: '', artist: 'Sunflower Bean' });
    expect(res.status).toBe(400);
    const answer = (await res.json()) as Record<string, unknown>;
    expect(answer.error).toContain('Titre requis');
    expect(answer).not.toHaveProperty('status');
  });

  it('keeps a valid track', async () => {
    const res = await like({
      title: 'In Flight',
      artist: 'Sunflower Bean',
      youtubeUrl: 'https://www.youtube.com/results?search_query=in+flight',
    });
    expect(res.status).toBe(200);
    expect(likeSpy).toHaveBeenCalled();
  });
});

describe('DELETE /api/track/like/:trackId', () => {
  it("sets the service's status and keeps it out of the answer", async () => {
    const res = await trackRoutes.handle(
      new Request('http://localhost/api/track/like/unknown', { method: 'DELETE' })
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Morceau non trouvé ou déjà supprimé' });
  });
});
