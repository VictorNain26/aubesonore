import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { rewriteHead } from './head.mjs';

const template = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const base = {
  title: 'AubeSonore',
  description: template.match(/<meta\s+name="description"\s+content="([^"]+)"/)[1],
};
const legal = [
  { locale: 'fr', path: '/mentions-legales/' },
  { locale: 'en', path: '/en/legal/' },
];

describe('rewriteHead', () => {
  const html = rewriteHead(
    template,
    base,
    {
      locale: 'fr',
      path: '/mentions-legales/',
      title: 'Mentions légales · AubeSonore',
      description: 'Qui édite AubeSonore.',
      station: base.description,
    },
    { siblings: legal }
  );

  it('names the page in its title, og:title and twitter:title', () => {
    expect(html).toContain('<title>Mentions légales · AubeSonore</title>');
    expect(html).toContain('<meta property="og:title" content="Mentions légales · AubeSonore" />');
    expect(html).toContain('<meta name="twitter:title" content="Mentions légales · AubeSonore" />');
  });

  it("leaves the site's name to the site: JSON-LD, og:site_name, author", () => {
    expect(html).toContain('"name": "AubeSonore"');
    expect(html).toContain('<meta property="og:site_name" content="AubeSonore" />');
    expect(html).toContain('<meta name="author" content="AubeSonore" />');
    expect(html).not.toContain('"name": "Mentions légales');
  });

  it('describes the station, not the page, in the JSON-LD', () => {
    expect(html).toContain(`"description": ${JSON.stringify(base.description)}`);
    expect(html).toContain('content="Qui édite AubeSonore."');
  });

  it('gives the English pages an English station and site', () => {
    const english = rewriteHead(
      template,
      base,
      {
        locale: 'en',
        path: '/en/',
        title: 'AubeSonore',
        description: 'A discovery radio.',
        station: 'A discovery radio.',
      },
      { siblings: legal }
    );
    expect(english).toContain('"description": "A discovery radio."');
    expect(english).toContain('"inLanguage": "en-GB"');
    expect(english).not.toContain('"inLanguage": "fr-FR"');
  });

  it('gives the page its address and its language versions', () => {
    expect(html).toContain(
      '<link rel="canonical" href="https://aubesonore.fr/mentions-legales/" />'
    );
    expect(html).toContain('hreflang="en" href="https://aubesonore.fr/en/legal/"');
    expect(html).toContain('hreflang="x-default" href="https://aubesonore.fr/mentions-legales/"');
  });
});
