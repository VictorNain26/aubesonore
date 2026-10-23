import { PASSWORD_MIN_LENGTH } from '@aubesonore/shared-types/auth';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';

import { env } from '../../config/env';
import { db } from '../../db/index';
import { user, session, verification, account } from '../../db/schema';
import { AUTH_CLIENT_IP, AUTH_RATE_LIMIT } from './limits';
import { sendBetterAuthEmail } from './sendBetterAuthEmail';
import { requestLocale } from '../locale';

const isProd = env.IS_PROD;

export const auth = betterAuth({
  url: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: env.ALLOWED_ORIGINS,

  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: { user, session, verification, account },
  }),

  // Secondary cookie cache: signed cookie carries a 5-min-fresh session snapshot.
  // Every authenticated request reads from the cookie instead of hitting the DB
  // — saves 1 SELECT+JOIN per request on the hot path. The cookie is rotated
  // server-side on every login/logout, so stale-after-revoke is bounded to maxAge.
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60,
    },
  },

  rateLimit: AUTH_RATE_LIMIT,

  advanced: {
    ipAddress: AUTH_CLIENT_IP,
    useSecureCookies: isProd,
    crossSubDomainCookies:
      isProd && env.COOKIE_DOMAIN
        ? { enabled: true, domain: env.COOKIE_DOMAIN }
        : { enabled: false },
    defaultCookieAttributes: {
      secure: isProd,
      httpOnly: true,
      sameSite: 'lax',
    },
  },

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    // Stated, not left to Better Auth's default (8, with a maximum of 128: better-auth
    // dist/context/create-context.mjs): the forms read the same constant.
    minPasswordLength: PASSWORD_MIN_LENGTH,

    sendResetPassword: async ({ user, url }, request): Promise<void> => {
      await sendBetterAuthEmail({
        to: user.email,
        kind: 'reset',
        locale: requestLocale(request?.headers.get('accept-language')),
        buttonLink: url,
      });
    },
  },

  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    // The sign-up page and the mail promise 24 hours; Better Auth's default is one hour
    // (emailVerification.expiresIn, @better-auth/core init-options).
    expiresIn: 24 * 60 * 60,

    sendVerificationEmail: async ({ user, url }, request): Promise<void> => {
      await sendBetterAuthEmail({
        to: user.email,
        kind: 'verify',
        locale: requestLocale(request?.headers.get('accept-language')),
        buttonLink: url,
      });
    },
  },

  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: ['google'],
    },
  },

  socialProviders: {
    ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? {
          google: {
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET,
          },
        }
      : {}),
  },
});
