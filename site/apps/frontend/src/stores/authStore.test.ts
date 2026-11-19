// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { useAuthStore } from './authStore';

// The store and its API client as the page runs them; the network is MSW's (mocks/handlers.ts).
const API = 'http://localhost:3000/api/auth';
const user = {
  id: '1',
  email: 'jane@example.com',
  name: 'Jane',
  image: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

beforeEach(() => {
  useAuthStore.setState({
    user: null,
    isLoading: true,
    isAuthenticated: false,
    authError: null,
  });
});

describe('useAuthStore', () => {
  it('signIn stores the returned user as authenticated', async () => {
    server.use(http.post(`${API}/sign-in/email`, () => HttpResponse.json({ user })));

    await useAuthStore.getState().signIn('jane@example.com', 'password123');

    expect(useAuthStore.getState()).toMatchObject({
      user,
      isAuthenticated: true,
      isLoading: false,
      authError: null,
    });
  });

  it('stays signed out when the server refuses the password', async () => {
    server.use(
      http.post(`${API}/sign-in/email`, () =>
        HttpResponse.json({ code: 'INVALID_EMAIL_OR_PASSWORD' }, { status: 401 })
      )
    );

    await expect(
      useAuthStore.getState().signIn('jane@example.com', 'wrong-password')
    ).rejects.toThrow();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it('signUp with a token stores the returned user as authenticated', async () => {
    server.use(
      http.post(`${API}/sign-up/email`, () => HttpResponse.json({ token: 'session-token', user }))
    );

    await useAuthStore.getState().signUp('jane@example.com', 'password123', 'Jane');

    expect(useAuthStore.getState()).toMatchObject({
      user,
      isAuthenticated: true,
      isLoading: false,
      authError: null,
    });
  });

  // With email verification required, Better Auth opens no session until the link is followed.
  it('signUp without a token leaves the listener signed out', async () => {
    await useAuthStore.getState().signUp('jane@example.com', 'password123', 'Jane');

    expect(useAuthStore.getState()).toMatchObject({ user: null, isAuthenticated: false });
  });

  it('signOut clears the session', async () => {
    useAuthStore.setState({ user, isAuthenticated: true, isLoading: false, authError: null });

    await useAuthStore.getState().signOut();

    expect(useAuthStore.getState()).toMatchObject({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      authError: null,
    });
  });

  it('init reads the session the server holds', async () => {
    server.use(http.get(`${API}/get-session`, () => HttpResponse.json({ session: {}, user })));

    await useAuthStore.getState().init();

    expect(useAuthStore.getState()).toMatchObject({
      user,
      isAuthenticated: true,
      isLoading: false,
    });
  });

  it('init leaves a visitor without a session signed out', async () => {
    await useAuthStore.getState().init();

    expect(useAuthStore.getState()).toMatchObject({
      user: null,
      isAuthenticated: false,
      isLoading: false,
    });
  });

  it('init falls back to an unauthenticated state on failure', async () => {
    server.use(http.get(`${API}/get-session`, () => HttpResponse.error()));

    await useAuthStore.getState().init();

    expect(useAuthStore.getState()).toMatchObject({
      user: null,
      isAuthenticated: false,
      isLoading: false,
    });
    expect(useAuthStore.getState().authError).not.toBeNull();
  });
});
