import type { BetterAuthOptions } from 'better-auth';

// Who is asking, for the sign-in limits. The origin is reachable only through the Cloudflare
// Tunnel, whose edge sets CF-Connecting-IP and drops any value a client sends (lib/rateLimit.ts).
// Better Auth reads x-forwarded-for by default and takes no address from a chain of several, so
// every caller whose chain had two entries shared one bucket per path; its docs give this header
// for Cloudflare (better-auth.com/docs/concepts/rate-limit, advanced.ipAddress).
export const AUTH_CLIENT_IP = {
  ipAddressHeaders: ['cf-connecting-ip'],
} satisfies NonNullable<BetterAuthOptions['advanced']>['ipAddress'];

export const AUTH_RATE_LIMIT = {
  enabled: true,
  window: 60,
  max: 100,
  customRules: {
    '/sign-in/email': { window: 60, max: 5 },
    '/sign-up/email': { window: 60, max: 3 },
    '/forget-password': { window: 60, max: 3 },
    '/verify-email': { window: 60, max: 10 },
  },
} satisfies BetterAuthOptions['rateLimit'];
