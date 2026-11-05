import { afterAll, beforeAll, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { sql } from 'drizzle-orm';
import { db, pool } from '../../db';
import { verification } from '../../db/schema';
import { assertTestDatabase } from '../../test/pg';
import { mailCopy } from './mailCopy';
import * as mails from './sendBetterAuthEmail';
import { auth } from './index';

// The production Better Auth, on the real database: the rules the sign-up and reset forms
// promise. The mail is the boundary; what it would carry is recorded.
const sent: Array<{ kind: string; buttonLink: string }> = [];
const mailSpy = spyOn(mails, 'sendBetterAuthEmail').mockImplementation((mail) => {
  sent.push(mail);
  return Promise.resolve();
});

let client = 0;
function post(path: string, body: unknown): Promise<Response> {
  client += 1;
  return auth.handler(
    new Request(`http://localhost:3000/api/auth${path}`, {
      method: 'POST',
      // A client of its own each time: the limits are tested in limits.test.ts.
      headers: { 'content-type': 'application/json', 'cf-connecting-ip': `198.51.100.${client}` },
      body: JSON.stringify(body),
    })
  );
}

const signUp = (email: string, password: string) =>
  post('/sign-up/email', { email, password, name: 'Listener' });

beforeAll(async () => {
  await assertTestDatabase();
});

beforeEach(async () => {
  await db.execute(sql`TRUNCATE "user", session, account, verification CASCADE`);
  sent.length = 0;
});

afterAll(async () => {
  mailSpy.mockRestore();
  await pool.end();
});

describe('sign-up', () => {
  // The forms announce eight characters (shared-types/auth.ts).
  it('refuses a password of seven characters and takes one of eight', async () => {
    const short = await signUp('short@example.test', '1234567');
    expect(short.status).toBe(400);
    expect(await short.json()).toMatchObject({ code: 'PASSWORD_TOO_SHORT' });

    expect((await signUp('long@example.test', '12345678')).status).toBe(200);
  });

  it('lets no one sign in before the address is confirmed, and sends the confirmation', async () => {
    await signUp('new@example.test', 'a-good-password');

    const signIn = await post('/sign-in/email', {
      email: 'new@example.test',
      password: 'a-good-password',
    });

    expect(signIn.status).toBe(403);
    expect(await signIn.json()).toMatchObject({ code: 'EMAIL_NOT_VERIFIED' });
    expect(sent.map((mail) => mail.kind)).toContain('verify');
  });
});

describe('the lifetimes the mails promise', () => {
  it('gives the confirmation link the 24 hours its mail says', async () => {
    await signUp('new@example.test', 'a-good-password');

    const link = sent.find((mail) => mail.kind === 'verify')?.buttonLink ?? '';
    const token = new URL(link).searchParams.get('token') ?? '';
    const claims = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString()) as {
      iat: number;
      exp: number;
    };

    expect(claims.exp - claims.iat).toBe(24 * 60 * 60);
    expect(mailCopy('verify', 'fr').body).toContain('24 heures');
    expect(mailCopy('verify', 'en').body).toContain('24 hours');
  });

  it('gives the reset link the hour its mail says', async () => {
    await signUp('new@example.test', 'a-good-password');

    const asked = Date.now();
    expect((await post('/request-password-reset', { email: 'new@example.test' })).status).toBe(200);
    const [row] = await db
      .select()
      .from(verification)
      .where(sql`${verification.identifier} LIKE 'reset-password:%'`);

    // An hour from the request, give or take the time the request took.
    const lifetime = (row?.expiresAt.getTime() ?? 0) - asked;
    expect(lifetime).toBeGreaterThan(60 * 60 * 1000 - 5_000);
    expect(lifetime).toBeLessThanOrEqual(60 * 60 * 1000 + 5_000);
    expect(mailCopy('reset', 'fr').body).toContain('une heure');
    expect(mailCopy('reset', 'en').body).toContain('one hour');
  });
});
