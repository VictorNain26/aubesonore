import { describe, expect, it } from 'bun:test';
import { env } from '../config/env';
import { mailCopy } from '../lib/auth/mailCopy';
import { renderMail } from './mailerService';

const LINK = 'https://aubesonore.fr/api/auth/verify-email?token=abc&callbackURL=%2Fmes-titres';

function render(kind: 'verify' | 'reset', locale: 'fr' | 'en', buttonLink = LINK) {
  const copy = mailCopy(kind, locale);
  return renderMail(copy.subject, {
    lang: locale,
    preheader: copy.preheader,
    heading: copy.heading,
    body: copy.body,
    buttonLink,
    buttonText: copy.button,
    ignore: copy.ignore,
  });
}

describe('renderMail', () => {
  it('writes each account mail in its language, its button on the link Better Auth gave', () => {
    for (const kind of ['verify', 'reset'] as const) {
      for (const locale of ['fr', 'en'] as const) {
        const copy = mailCopy(kind, locale);
        const { html, text } = render(kind, locale);

        expect(html).toContain(`<html lang="${locale}">`);
        expect(html).toContain(copy.heading);
        expect(html).toContain(`href="${LINK.replace('&', '&amp;')}" class="button"`);
        expect(html).toContain(`>${copy.button}</a>`);
        // The plain text keeps the link whole, so a client without HTML can still follow it.
        expect(text).toContain(LINK);
      }
    }
  });

  it("shows the site's lockup as an image with its name, by day and by night", () => {
    const { html, text } = render('verify', 'fr');

    expect(html).toContain(`src="${env.FRONTEND_BASE_URL}/lockup.png" alt="AubeSonore"`);
    expect(html).toContain(`src="${env.FRONTEND_BASE_URL}/lockup-night.png" alt="AubeSonore"`);
    expect(html).toMatch(/@media \(prefers-color-scheme: ?dark\)/);
    expect(html).toContain('<meta name="color-scheme" content="light dark" />');
    // The images are not words: the plain text does not list them.
    expect(text).not.toContain('lockup');
  });

  it('signs with the address of the site, as a link', () => {
    const { html } = render('reset', 'en');

    expect(html).toContain(`<a href="${env.FRONTEND_BASE_URL}"`);
    expect(html).toContain(`>${new URL(env.FRONTEND_BASE_URL).host}</a>`);
  });

  it('escapes what it is given, so a link cannot break out of its attribute', () => {
    const { html } = render(
      'verify',
      'fr',
      'https://aubesonore.fr/?x="><img src=x onerror=alert(1)>'
    );

    expect(html).not.toContain('"><img src=x');
    expect(html).toContain('&quot;&gt;&lt;img src=x onerror=alert(1)&gt;');
  });
});
