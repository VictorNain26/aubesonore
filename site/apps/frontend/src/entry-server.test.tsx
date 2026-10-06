// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { ArtistProfile } from '@aubesonore/shared-types/client';
import { artistPageHtml, meta, pageHtml } from './entry-server';

const PROFILE: ArtistProfile = {
  id: 'a1',
  name: 'Кино',
  slug: 'кино',
  mbid: null,
  played: true,
  image: null,
  facts: null,
  summary: {
    text: 'Groupe de rock soviétique.',
    lang: 'fr',
    url: 'https://fr.wikipedia.org/wiki/Kino_(groupe)',
  },
  links: [],
  playedOnRadio: [],
};

// Runs without window, document or localStorage, like the build-time
// pre-render: any browser API touched at import or render time fails here.
describe('entry-server', () => {
  it('renders the French home page as static HTML', async () => {
    const html = await pageHtml('fr');
    expect(html).toContain('Des titres à l&#x27;aube de vous plaire.');
    expect(html).toContain('Depuis l&#x27;aube');
  });

  it('renders the English home page as static HTML', async () => {
    const html = await pageHtml('en');
    expect(html).toContain('The first light of your next favourite songs.');
    expect(html).toContain('Most kept');
  });

  it('marks the language of the page as the current one, not the language of the first render', async () => {
    await pageHtml('fr');
    expect(await pageHtml('en')).toMatch(
      /<a href="\/en\/" hrefLang="en" lang="en" aria-current="true"/
    );
    expect(await pageHtml('fr')).toMatch(
      /<a href="\/" hrefLang="fr" lang="fr" aria-current="true"/
    );
  });

  it('renders the legal page with the publisher and the data controller, under the header', async () => {
    const fr = await pageHtml('fr', '/mentions-legales/');
    expect(fr).toContain('Mentions légales et confidentialité');
    expect(fr).toContain('Victor Lenain');
    expect(fr).toContain('contact@aubesonore.fr');
    expect(fr).toContain('aria-label="Navigation principale"');
    expect(await pageHtml('en', '/en/legal/')).toContain('Legal notice and privacy');
  });

  it('renders the 404 in the language of its path, leading back to the live', async () => {
    const fr = await pageHtml('fr', '/404');
    expect(fr).toContain('Un blanc à l&#x27;antenne.');
    expect(fr).not.toContain('Dead air');
    const en = await pageHtml('en', '/en/404');
    expect(en).toContain('Dead air.');
    expect(en).toContain('href="/en/"');
  });

  it('renders an artist page from its data, footer included, in the language of its path', async () => {
    const fr = await artistPageHtml(
      { locale: 'fr', profile: PROFILE, musilogy: null },
      '/artiste/%D0%BA%D0%B8%D0%BD%D0%BE'
    );
    expect(fr).toMatch(/<h1[^>]*>Кино<\/h1>/);
    expect(fr).toContain('Groupe de rock soviétique.');
    expect(fr).toContain('<footer');
    expect(fr).not.toContain('aria-busy="true"');

    const en = await artistPageHtml(
      { locale: 'en', profile: PROFILE, musilogy: null },
      '/en/artist/%D0%BA%D0%B8%D0%BD%D0%BE'
    );
    expect(en).toContain('href="/en/legal/"');
  });

  it('writes a large artist page in one piece, with no inline script the CSP would block', async () => {
    const long = {
      ...PROFILE,
      summary: { ...PROFILE.summary!, text: 'Groupe de rock. '.repeat(2000) },
    };
    const html = await artistPageHtml(
      { locale: 'fr', profile: long, musilogy: null },
      '/artiste/%D0%BA%D0%B8%D0%BD%D0%BE'
    );
    expect(html.length).toBeGreaterThan(12_800);
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<template');
    expect(html).not.toMatch(/<div hidden/);
  });

  it('gives each language its own title and description', () => {
    expect(meta('fr').title).toBe('AubeSonore');
    expect(meta('en').description).toMatch(/^A discovery radio/);
  });
});
