import { afterEach, expect, it, mock, spyOn } from 'bun:test';
import { env } from '../../config/env';
import { logger } from '../logger';
import { sendBetterAuthEmail } from './sendBetterAuthEmail';

const { IS_PROD, DISABLE_EMAILS } = env;
const mail = {
  to: 'listener@example.test',
  kind: 'reset',
  locale: 'fr',
  buttonLink: 'https://aubesonore.fr/reset?token=secret',
} as const;

afterEach(() => {
  env.IS_PROD = IS_PROD;
  env.DISABLE_EMAILS = DISABLE_EMAILS;
  mock.restore();
});

it('keeps the address and the link out of production logs when mails are off', async () => {
  env.IS_PROD = true;
  env.DISABLE_EMAILS = true;
  const info = spyOn(logger, 'info');
  await sendBetterAuthEmail(mail);
  const logged = JSON.stringify(info.mock.calls);
  expect(logged).not.toContain(mail.to);
  expect(logged).not.toContain('token=');
});

it('logs the link off production, where it is how a developer opens the account', async () => {
  env.IS_PROD = false;
  env.DISABLE_EMAILS = true;
  const info = spyOn(logger, 'info');
  await sendBetterAuthEmail(mail);
  expect(JSON.stringify(info.mock.calls)).toContain(mail.buttonLink);
});
