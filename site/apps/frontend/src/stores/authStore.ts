import { create } from 'zustand';
import { authApi, type User } from '../lib/api';

// Auth state owned by a Zustand store (single source of truth, granular
// selectors). Replaces the previous React Context. The session is
// hydrated once on mount via `init()`, called from <AuthInit />, which
// also subscribes to auth transitions and dispatches refresh()/clear()
// on the auth-dependent stores (liked tracks, preferences).

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  authError: string | null;
}

interface AuthActions {
  init: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** The server no longer knows the session (a 401): the page stops showing the listener signed in. */
  sessionEnded: () => void;
}

export type AuthStore = AuthState & AuthActions;

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  isLoading: true,
  isAuthenticated: false,
  authError: null,

  init: async () => {
    set({ isLoading: true, authError: null });
    try {
      const session = await authApi.getSession();
      set({
        user: session?.user || null,
        isAuthenticated: !!session?.user,
        isLoading: false,
        authError: null,
      });
    } catch (err) {
      set({
        user: null,
        isAuthenticated: false,
        isLoading: false,
        authError: err instanceof Error ? err.message : 'Erreur réseau',
      });
    }
  },

  signIn: async (email, password) => {
    const response = await authApi.signIn(email, password);
    set({
      user: response.user,
      isAuthenticated: true,
      isLoading: false,
      authError: null,
    });
  },

  // Signed in only when Better Auth opened a session (a token); with email verification
  // required it opens none until the link in the email is followed.
  signUp: async (email, password, name) => {
    const { token, user } = await authApi.signUp(email, password, name);
    if (token === null) return;
    set({ user, isAuthenticated: true, isLoading: false, authError: null });
  },

  signOut: async () => {
    await authApi.signOut();
    set({ user: null, isAuthenticated: false, isLoading: false, authError: null });
  },

  sessionEnded: () => {
    set({ user: null, isAuthenticated: false, isLoading: false, authError: null });
  },
}));
