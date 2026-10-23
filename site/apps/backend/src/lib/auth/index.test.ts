import { describe, expect, it } from 'bun:test';
import { PASSWORD_MIN_LENGTH } from '@aubesonore/shared-types/auth';
import { auth } from './index';

describe('auth', () => {
  it('refuses a password under the minimum the sign-up and reset forms announce', async () => {
    // The rule Better Auth applies on sign-up, reset and change, after its own defaults.
    const { password } = await auth.$context;
    expect(password.config.minPasswordLength).toBe(PASSWORD_MIN_LENGTH);
  });
});
