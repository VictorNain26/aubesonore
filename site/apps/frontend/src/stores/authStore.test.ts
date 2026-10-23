// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { useAuthStore } from './authStore';
import { authApi } from '../lib/api';

vi.mock('../lib/api', () => ({
  authApi: {
    getSession: vi.fn(),
    signIn: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(),
  },
}));

const user = {
  id: '1',
  email: 'jane@example.com',
  name: 'Jane',
  image: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  useAuthStore.setState({
    user: null,
    isLoading: true,
    isAuthenticated: false,
    authError: null,
  });
});

const session = {
  session: { id: 's1', userId: user.id, expiresAt: '2026-01-02T00:00:00.000Z' },
  user,
};

describe('useAuthStore', () => {
  it('signIn stores the returned user as authenticated', async () => {
    vi.mocked(authApi.signIn).mockResolvedValue(session);

    await useAuthStore.getState().signIn('jane@example.com', 'password123');

    expect(authApi.signIn).toHaveBeenCalledWith('jane@example.com', 'password123');
    expect(useAuthStore.getState()).toMatchObject({
      user,
      isAuthenticated: true,
      isLoading: false,
      authError: null,
    });
  });

  it('signUp without a token leaves the listener signed out until the email is verified', async () => {
    // requireEmailVerification: Better Auth creates the user but opens no session.
    vi.mocked(authApi.signUp).mockResolvedValue({ token: null, user });
    useAuthStore.setState({ isLoading: false });

    await useAuthStore.getState().signUp('jane@example.com', 'password123', 'Jane');

    expect(authApi.signUp).toHaveBeenCalledWith('jane@example.com', 'password123', 'Jane');
    expect(useAuthStore.getState()).toMatchObject({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      authError: null,
    });
  });

  it('signUp with a token stores the returned user as authenticated', async () => {
    vi.mocked(authApi.signUp).mockResolvedValue({ token: 'session-token', user });

    await useAuthStore.getState().signUp('jane@example.com', 'password123', 'Jane');

    expect(useAuthStore.getState()).toMatchObject({
      user,
      isAuthenticated: true,
      isLoading: false,
      authError: null,
    });
  });

  it('signOut clears the session', async () => {
    useAuthStore.setState({ user, isAuthenticated: true, isLoading: false, authError: null });
    vi.mocked(authApi.signOut).mockResolvedValue(undefined);

    await useAuthStore.getState().signOut();

    expect(authApi.signOut).toHaveBeenCalled();
    expect(useAuthStore.getState()).toMatchObject({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      authError: null,
    });
  });

  it('init falls back to an unauthenticated state on failure', async () => {
    vi.mocked(authApi.getSession).mockRejectedValue(new Error('network down'));

    await useAuthStore.getState().init();

    expect(useAuthStore.getState()).toMatchObject({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      authError: 'network down',
    });
  });
});
