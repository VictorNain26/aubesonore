import { describe, expect, it } from 'bun:test';
import { betterAuth } from 'better-auth';
import { memoryAdapter } from 'better-auth/adapters/memory';
import { AUTH_CLIENT_IP, AUTH_RATE_LIMIT } from './limits';

// The production limits on a Better Auth with an in-memory store: the sign-in route is counted
// per Cloudflare client address, whatever chain of x-forwarded-for comes with it.
function makeAuth() {
  return betterAuth({
    baseURL: 'http://localhost:3000',
    secret: 'test-secret-test-secret-test-secret-32',
    database: memoryAdapter({ user: [], session: [], account: [], verification: [] }),
    emailAndPassword: { enabled: true },
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
      statuses.push((await signIn(auth, '203.0.113.7', `198.51.100.${i}`)).status);
    }
    expect(statuses.slice(0, 5)).not.toContain(429);
    expect(statuses[5]).toBe(429);
  });

  it('give each client its own count', async () => {
    const auth = makeAuth();
    // Chains of two, as a proxy on the way writes them: read alone, they would share one bucket.
    for (let i = 0; i < 5; i++) await signIn(auth, '203.0.113.7', '10.0.0.2, 203.0.113.7');
    expect((await signIn(auth, '203.0.113.8', '10.0.0.2, 203.0.113.8')).status).not.toBe(429);
  });
});
