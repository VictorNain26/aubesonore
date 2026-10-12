import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { admin } from 'better-auth/plugins';

import { env } from '../../config/env';
import { db } from '../../db/index';
import { user, session, verification, account } from '../../db/schema';
import { AUTH_CLIENT_IP, AUTH_RATE_LIMIT } from './limits';
import { sendBetterAuthEmail } from './sendBetterAuthEmail';

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

    sendResetPassword: async ({
      user,
      url,
    }: {
      user: { email: string };
      url: string;
    }): Promise<void> => {
      await sendBetterAuthEmail({
        to: user.email,
        subject: '🔒 Réinitialisez votre mot de passe',
        preheader: 'Réinitialisez votre mot de passe pour continuer à profiter de AubeSonore 🔒',
        buttonLink: url,
        buttonText: 'Réinitialiser mon mot de passe',
        isResetPassword: true,
      });
    },
  },

  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,

    sendVerificationEmail: async ({
      user,
      url,
    }: {
      user: { email: string };
      url: string;
    }): Promise<void> => {
      await sendBetterAuthEmail({
        to: user.email,
        subject: '🎉 Confirmez votre adresse email',
        preheader: 'Confirmez votre adresse email pour activer votre compte 🎶',
        buttonLink: url,
        buttonText: 'Vérifier mon email',
        isVerificationEmail: true,
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

  plugins: [admin()],
});
