import { describe, expect, it } from 'bun:test';
import { mailCopy } from './mailCopy';

describe('mailCopy', () => {
  it('writes each mail in the language it was asked in, without emoji', () => {
    expect(mailCopy('verify', 'fr').subject).toBe('Confirmez votre adresse e-mail');
    expect(mailCopy('verify', 'en').subject).toBe('Confirm your email address');
    expect(mailCopy('reset', 'en').button).toBe('Choose a password');
    for (const kind of ['verify', 'reset'] as const) {
      for (const locale of ['fr', 'en'] as const) {
        expect(Object.values(mailCopy(kind, locale)).join(' ')).not.toMatch(
          /\p{Extended_Pictographic}/u
        );
      }
    }
  });

  it('promises the lifetimes Better Auth is given (lib/auth/index.ts)', () => {
    expect(mailCopy('verify', 'fr').body).toContain('24 heures');
    expect(mailCopy('reset', 'fr').body).toContain('une heure');
  });
});
