import { API_BASE_URL } from '../utils/config';
import { createTrackApi } from '@aubesonore/core/api';
import type { ApiClient } from '@aubesonore/core/api';
import type { AuthResponse } from '@aubesonore/shared-types/client';
import * as m from '@/paraglide/messages.js';

export type {
  ClientLikedTrack as LikedTrack,
  LikeTrackRequest,
} from '@aubesonore/shared-types/client';

export type { User } from '@aubesonore/shared-types/client';

async function fetchApi<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = (await response.json().catch(() => ({ error: m.error_network() }))) as {
      error?: string;
    };
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json() as Promise<T>;
}

const apiClient: ApiClient = { fetch: fetchApi };

// Better Auth's error codes (@better-auth/core, dist/error/codes.mjs). Its
// messages are English ("Invalid email or password"): they never reach the
// page, a known code gets its own words and any other the caller's fallback.
const AUTH_ERRORS: Record<string, () => string> = {
  INVALID_EMAIL_OR_PASSWORD: m.auth_error_credentials,
  EMAIL_NOT_VERIFIED: m.auth_error_not_verified,
  USER_ALREADY_EXISTS: m.auth_error_exists,
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: m.auth_error_exists,
  INVALID_EMAIL: m.auth_error_email_invalid,
  PASSWORD_TOO_SHORT: m.auth_error_password_length,
  PASSWORD_TOO_LONG: m.auth_error_password_long,
  INVALID_TOKEN: m.error_link_invalid,
  TOKEN_EXPIRED: m.error_link_invalid,
};

async function authError(response: Response, fallback: () => string): Promise<Error> {
  // The rate limiter answers 429 with a message and no code.
  if (response.status === 429) return new Error(m.auth_error_rate_limited());
  const body = (await response.json().catch(() => ({}))) as { code?: unknown };
  const known = typeof body.code === 'string' ? AUTH_ERRORS[body.code] : undefined;
  return new Error((known ?? fallback)());
}

export const trackApi = createTrackApi(apiClient);

export const authApi = {
  getSession: async (): Promise<AuthResponse | null> => {
    const response = await fetch(`${API_BASE_URL}/api/auth/get-session`, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    });
    if (response.status === 401 || response.status === 403) return null;
    if (!response.ok) {
      throw new Error(`getSession failed: HTTP ${response.status}`);
    }
    const data = (await response.json()) as { user?: unknown };
    if (!data.user) return null;
    return data as AuthResponse;
  },

  signUp: async (email: string, password: string, name: string): Promise<AuthResponse> => {
    const response = await fetch(`${API_BASE_URL}/api/auth/sign-up/email`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name }),
    });
    if (!response.ok) throw await authError(response, m.error_signup_failed);
    return response.json() as Promise<AuthResponse>;
  },

  signIn: async (email: string, password: string): Promise<AuthResponse> => {
    const response = await fetch(`${API_BASE_URL}/api/auth/sign-in/email`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!response.ok) throw await authError(response, m.error_signin_failed);
    return response.json() as Promise<AuthResponse>;
  },

  signOut: async (): Promise<void> => {
    await fetch(`${API_BASE_URL}/api/auth/sign-out`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
    });
  },

  forgetPassword: async (email: string): Promise<void> => {
    // Better Auth appends ?token=<TOKEN> (or ?error=INVALID_TOKEN) to redirectTo.
    // /reset-password is the sign-in page in its new-password form.
    const response = await fetch(`${API_BASE_URL}/api/auth/forget-password`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, redirectTo: `${window.location.origin}/reset-password` }),
    });
    if (!response.ok && response.status !== 404) {
      // 404 is returned when the email isn't registered — treat as success to
      // avoid email enumeration. Other errors bubble up.
      throw await authError(response, m.error_request_failed);
    }
  },

  resetPassword: async (token: string, newPassword: string): Promise<void> => {
    const response = await fetch(`${API_BASE_URL}/api/auth/reset-password`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, newPassword }),
    });
    if (!response.ok) throw await authError(response, m.error_reset_failed);
  },

  // Better Auth's /sign-in/social is POST-only: POST {provider, callbackURL},
  // receive { url } (the provider authorize URL) and redirect the browser to it.
  signInWithProvider: async (provider: 'google', callbackURL: string): Promise<void> => {
    const response = await fetch(`${API_BASE_URL}/api/auth/sign-in/social`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider, callbackURL }),
    });
    if (!response.ok) throw await authError(response, m.error_oauth_failed);
    const data = (await response.json()) as { url?: string };
    if (!data.url) throw new Error(m.error_redirect_missing());
    window.location.href = data.url;
  },
};
