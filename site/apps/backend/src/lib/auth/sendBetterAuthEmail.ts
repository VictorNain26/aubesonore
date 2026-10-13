import type { SiteLocale } from '@aubesonore/shared-types/client';
import { sendMail } from '../../services/mailerService.js';
import { env } from '../../config/env';
import { logger } from '../logger';
import { mailCopy, type MailKind } from './mailCopy';

/** An account mail (confirm the address, a new password), in the language it was asked in. */
export async function sendBetterAuthEmail({
  to,
  kind,
  locale,
  buttonLink,
}: {
  to: string;
  kind: MailKind;
  locale: SiteLocale;
  buttonLink: string;
}): Promise<void> {
  const copy = mailCopy(kind, locale);
  if (env.DISABLE_EMAILS) {
    logger.info('better_auth_email.skipped_debug_mode', { to, kind, locale, buttonLink });
    return;
  }

  try {
    await sendMail({
      to,
      subject: copy.subject,
      variables: {
        lang: locale,
        preheader: copy.preheader,
        heading: copy.heading,
        body: copy.body,
        buttonLink,
        buttonText: copy.button,
        ignore: copy.ignore,
        footer: copy.footer,
      },
    });
    logger.info('better_auth_email.sent', { to, kind, locale });
  } catch (error) {
    logger.error('better_auth_email.failed', {
      to,
      kind,
      message: error instanceof Error ? error.message : String(error),
    });
    throw error instanceof Error ? error : new Error("Erreur lors de l'envoi de l'e-mail.");
  }
}
