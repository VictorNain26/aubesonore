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

/** Each element the selector finds: its attributes as written (entities kept) and its text. */
function elements(html: string, selector: string) {
  const found: { attrs: Record<string, string>; text: string }[] = [];
  new HTMLRewriter()
    .on(selector, {
      element(el) {
        found.push({ attrs: Object.fromEntries(el.attributes), text: '' });
      },
      text(chunk) {
        const last = found.at(-1);
        if (last) last.text += chunk.text;
      },
    })
    .transform(html);
  return found.map((e) => ({ ...e, text: e.text.trim() }));
}

describe('renderMail', () => {
  it('writes each account mail in its language, its button on the link Better Auth gave', () => {
    for (const kind of ['verify', 'reset'] as const) {
      for (const locale of ['fr', 'en'] as const) {
        const copy = mailCopy(kind, locale);
        const { html, text } = render(kind, locale);

        expect(elements(html, 'html')[0]?.attrs.lang).toBe(locale);
        expect(elements(html, 'h1')[0]?.text).toBe(copy.heading);
        const [button] = elements(html, 'a.button');
        expect(button?.attrs.href).toBe(LINK.replace('&', '&amp;'));
        expect(button?.text).toBe(copy.button);
        // The plain text keeps the link whole, so a client without HTML can still follow it.
        expect(text).toContain(LINK);
      }
    }
  });

  it("shows the site's lockup as an image with its name, by day and by night", () => {
    const { html, text } = render('verify', 'fr');

    expect(elements(html, 'img').map((img) => [img.attrs.src, img.attrs.alt])).toEqual([
      [`${env.FRONTEND_BASE_URL}/lockup.png`, 'AubeSonore'],
      [`${env.FRONTEND_BASE_URL}/lockup-night.png`, 'AubeSonore'],
    ]);
    expect(html).toMatch(/@media \(prefers-color-scheme: ?dark\)/);
    expect(elements(html, 'meta[name="color-scheme"]')[0]?.attrs.content).toBe('light dark');
    // The images are not words: the plain text does not list them.
    expect(text).not.toContain('lockup');
  });

  it('signs with the address of the site, as a link', () => {
    const { html } = render('reset', 'en');

    const [site] = elements(html, 'a:not(.button)');
    expect(site?.attrs.href).toBe(env.FRONTEND_BASE_URL);
    expect(site?.text).toBe(new URL(env.FRONTEND_BASE_URL).host);
  });

  it('escapes what it is given, so a link cannot break out of its attribute', () => {
    const { html } = render(
      'verify',
      'fr',
      'https://aubesonore.fr/?x="><img src=x onerror=alert(1)>'
    );

    expect(html).not.toContain('"><img src=x');
    expect(elements(html, 'a.button')[0]?.attrs.href).toBe(
      'https://aubesonore.fr/?x=&quot;&gt;&lt;img src=x onerror=alert(1)&gt;'
    );
  });
});
