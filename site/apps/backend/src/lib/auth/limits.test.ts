import { describe, expect, it } from 'bun:test';
import { betterAuth } from 'better-auth';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { AUTH_CLIENT_IP, AUTH_RATE_LIMIT } from './limits';

// The production limits on a Better Auth with an in-memory store: the sign-in route is counted
// per Cloudflare client address, whatever chain of x-forwarded-for comes with it. Better Auth keeps
// that store in its module (better-auth/dist/api/rate-limiter), shared by every instance of the
// process: each test counts its own client addresses, or one test's tries fill another's bucket.
function makeAuth() {
  return betterAuth({
    baseURL: 'http://localhost:3000',
    secret: 'test-secret-test-secret-test-secret-32',
    database: memoryAdapter({ user: [], session: [], account: [], verification: [] }),
    emailAndPassword: { enabled: true, sendResetPassword: async () => {} },
    rateLimit: AUTH_RATE_LIMIT,
    advanced: { ipAddress: AUTH_CLIENT_IP },
  });
}

function signIn(auth: ReturnType<typeof makeAuth>, clientIp: string, forwardedFor: string) {
  return auth.handler(
    new Request('http://localhost:3000/api/auth/sign-in/email', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'cf-connecting-ip': clientIp,
        'x-forwarded-for': forwardedFor,
      },
      body: JSON.stringify({ email: 'listener@example.com', password: 'not-the-password' }),
    })
  );
}

describe('sign-in limits', () => {
  it('count a client by its Cloudflare address, not by the chain it sends', async () => {
    const auth = makeAuth();
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      // A new x-forwarded-for on each try: read alone, it would open a new bucket every time.
      statuses.push((await signIn(auth, '203.0.113.1', `198.51.100.${i}`)).status);
    }
    expect(statuses.slice(0, 5)).not.toContain(429);
    expect(statuses[5]).toBe(429);
  });

  it('give each client its own count', async () => {
    const auth = makeAuth();
    // Chains of two, as a proxy on the way writes them: read alone, they would share one bucket.
    for (let i = 0; i < 5; i++) await signIn(auth, '203.0.113.2', '10.0.0.2, 203.0.113.2');
    expect((await signIn(auth, '203.0.113.3', '10.0.0.2, 203.0.113.3')).status).not.toBe(429);
  });
});

describe('password reset limits', () => {
  it('count the route the reset form calls, three a minute per client', async () => {
    const auth = makeAuth();
    const statuses: number[] = [];
    for (let i = 0; i < 4; i++) {
      const response = await auth.handler(
        new Request('http://localhost:3000/api/auth/request-password-reset', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.4' },
          body: JSON.stringify({ email: 'listener@example.com' }),
        })
      );
      statuses.push(response.status);
    }
    expect(statuses).toEqual([200, 200, 200, 429]);
  });
});

describe('sign-up and confirmation limits', () => {
  it('count three sign-ups a minute per client, each with a new address', async () => {
    const auth = makeAuth();
    const statuses: number[] = [];
    for (let i = 0; i < 4; i++) {
      const response = await auth.handler(
        new Request('http://localhost:3000/api/auth/sign-up/email', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.5' },
          body: JSON.stringify({ email: `new${i}@example.com`, password: 'a-password', name: 'N' }),
        })
      );
      statuses.push(response.status);
    }
    expect(statuses.slice(0, 3)).not.toContain(429);
    expect(statuses[3]).toBe(429);
  });

  it('count ten confirmation links a minute per client, the eleventh refused', async () => {
    const auth = makeAuth();
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) {
      const response = await auth.handler(
        new Request(`http://localhost:3000/api/auth/verify-email?token=guess-${i}`, {
          headers: { 'cf-connecting-ip': '203.0.113.6' },
        })
      );
      statuses.push(response.status);
    }
    expect(statuses.slice(0, 10)).not.toContain(429);
    expect(statuses[10]).toBe(429);
  });
});
