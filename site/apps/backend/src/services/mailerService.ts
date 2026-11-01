import nodemailer from 'nodemailer';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { htmlToText } from 'html-to-text';
import { env } from '../config/env';
import { logger } from '../lib/logger';
import { escapeHtml } from './templates/escapeHtml';
import { LOCKUP } from './templates/lockup';

type MailVariables = Record<string, string | undefined>;

interface SendMailOptions {
  to: string;
  subject: string;
  variables?: MailVariables;
}

// Resolve template path relative to this source file, not the process CWD.
// Without this, `bun run apps/backend/src/index.ts` from the monorepo root
// would silently fail to find the template at module load.
const here = dirname(fileURLToPath(import.meta.url));
const htmlTemplate = readFileSync(resolve(here, 'templates/mailTemplate.html'), 'utf-8');

// What every mail shows besides its copy: the lockup and the site's address.
const SITE: MailVariables = {
  lockupUrl: LOCKUP.day,
  lockupNightUrl: LOCKUP.night,
  lockupWidth: String(LOCKUP.width),
  lockupHeight: String(LOCKUP.height),
  lockupAlt: LOCKUP.alt,
  siteUrl: env.FRONTEND_BASE_URL,
  siteHost: new URL(env.FRONTEND_BASE_URL).host,
};

/** The mail's HTML, every value escaped, and its plain text. */
export function renderMail(subject: string, variables: MailVariables = {}) {
  const values: MailVariables = { ...SITE, subject, ...variables };
  const html = htmlTemplate.replace(/{{(.*?)}}/g, (_: string, key: string) =>
    escapeHtml(values[key.trim()] ?? '')
  );
  // The lockup is a picture of the name: the text needs neither it nor its address.
  const text = htmlToText(html, {
    wordwrap: 130,
    selectors: [{ selector: 'img', format: 'skip' }],
  });
  return { html, text };
}

const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: env.SMTP_PORT === 465, // implicit TLS on 465
  requireTLS: env.IS_PROD && env.SMTP_PORT !== 465, // STARTTLS on 587 in prod
  auth: env.SMTP_USER
    ? {
        user: env.SMTP_USER,
        pass: env.SMTP_PASSWORD,
      }
    : undefined,
});

export async function sendMail({ to, subject, variables = {} }: SendMailOptions): Promise<void> {
  try {
    const { html, text } = renderMail(subject, variables);

    const info = await transporter.sendMail({
      from: env.SMTP_FROM,
      to,
      subject,
      html,
      text,
    });

    logger.info('mailer.sent', { messageId: info.messageId, to, subject });
  } catch (err: unknown) {
    logger.error('mailer.send_failed', { message: (err as Error).message, to, subject });
    throw new Error("Erreur lors de l'envoi de l'e-mail.");
  }
}
