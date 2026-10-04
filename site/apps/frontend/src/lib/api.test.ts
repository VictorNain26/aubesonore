import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { authApi } from './api';

describe('authApi.getSession', () => {
  it('returns null when no session (401)', async () => {
    server.use(
      http.get('http://localhost:3000/api/auth/get-session', () =>
        HttpResponse.json({ user: null }, { status: 401 })
      )
    );
    const result = await authApi.getSession();
    expect(result).toBeNull();
  });

  it('returns user when session valid', async () => {
    server.use(
      http.get('http://localhost:3000/api/auth/get-session', () =>
        HttpResponse.json({ user: { id: 'u1', email: 'x@y.z', name: 'X' } })
      )
    );
    const result = await authApi.getSession();
    expect(result?.user.id).toBe('u1');
  });

  it('throws on network error', async () => {
    server.use(http.get('http://localhost:3000/api/auth/get-session', () => HttpResponse.error()));
    await expect(authApi.getSession()).rejects.toThrow();
  });

  it('throws on 500', async () => {
    server.use(
      http.get('http://localhost:3000/api/auth/get-session', () =>
        HttpResponse.json({ error: 'boom' }, { status: 500 })
      )
    );
    await expect(authApi.getSession()).rejects.toThrow();
  });
});

describe('authApi.signInWithProvider', () => {
  let location: { origin: string; href: string };

  beforeEach(() => {
    location = { origin: 'http://localhost:3000', href: 'http://localhost:3000/en/' };
    vi.stubGlobal('window', { location });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('redirects to the provider and comes back to the page the listener was on', async () => {
    const authorizeUrl = 'https://accounts.google.com/o/oauth2/auth?client_id=x';
    let receivedBody: unknown;
    server.use(
      http.post('http://localhost:3000/api/auth/sign-in/social', async ({ request }) => {
        receivedBody = await request.json();
        return HttpResponse.json({ url: authorizeUrl });
      })
    );

    await authApi.signInWithProvider('google');

    expect(receivedBody).toEqual({ provider: 'google', callbackURL: 'http://localhost:3000/en/' });
    expect(location.href).toBe(authorizeUrl);
  });

  it('throws when the response has no redirect URL', async () => {
    server.use(
      http.post('http://localhost:3000/api/auth/sign-in/social', () => HttpResponse.json({}))
    );
    await expect(authApi.signInWithProvider('google')).rejects.toThrow(
      "La connexion avec Google n'a pas pu démarrer. Réessayez."
    );
    expect(location.href).toBe('http://localhost:3000/en/');
  });

  it("never shows the server's English message, only the page's own words", async () => {
    server.use(
      http.post('http://localhost:3000/api/auth/sign-in/social', () =>
        HttpResponse.json({ message: 'Provider not configured' }, { status: 400 })
      )
    );
    await expect(authApi.signInWithProvider('google')).rejects.toThrow('Connexion impossible');
  });

  it('falls back to a default message when the error body is not JSON', async () => {
    server.use(
      http.post(
        'http://localhost:3000/api/auth/sign-in/social',
        () => new HttpResponse('upstream down', { status: 502 })
      )
    );
    await expect(authApi.signInWithProvider('google')).rejects.toThrow('Connexion impossible');
  });
});

describe('authApi errors', () => {
  const answer = (path: string, status: number, body: Record<string, string>) =>
    server.use(
      http.post(`http://localhost:3000/api/auth/${path}`, () => HttpResponse.json(body, { status }))
    );

  it("says a wrong email or password in French, not Better Auth's English", async () => {
    answer('sign-in/email', 401, {
      message: 'Invalid email or password',
      code: 'INVALID_EMAIL_OR_PASSWORD',
    });
    await expect(authApi.signIn('a@b.fr', 'wrong-pass')).rejects.toThrow(
      'E-mail ou mot de passe incorrect.'
    );
  });

  it('tells an unconfirmed address and an address already registered apart', async () => {
    answer('sign-in/email', 403, { message: 'Email not verified', code: 'EMAIL_NOT_VERIFIED' });
    await expect(authApi.signIn('a@b.fr', 'secret-pass')).rejects.toThrow(
      'Adresse e-mail pas encore confirmée : ouvrez le lien reçu par e-mail.'
    );

    answer('sign-up/email', 422, {
      message: 'User already exists. Use another email.',
      code: 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL',
    });
    await expect(authApi.signUp('a@b.fr', 'secret-pass', 'A')).rejects.toThrow(
      'Un compte existe déjà avec cette adresse. Connectez-vous.'
    );
  });

  it('says to wait when the rate limit answers, and falls back on an unknown code', async () => {
    answer('sign-in/email', 429, { message: 'Too many requests. Please try again later.' });
    await expect(authApi.signIn('a@b.fr', 'secret-pass')).rejects.toThrow(
      'Trop de tentatives. Réessayez dans une minute.'
    );

    answer('sign-in/email', 400, { message: 'Validation Error', code: 'VALIDATION_ERROR' });
    await expect(authApi.signIn('a@b.fr', 'secret-pass')).rejects.toThrow(
      'Connexion impossible pour le moment. Réessayez dans un instant.'
    );
  });
});
