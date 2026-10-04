// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { meta, pageHtml } from './entry-server';

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

  it('gives each language its own title and description', () => {
    expect(meta('fr').title).toBe('AubeSonore');
    expect(meta('en').description).toMatch(/^A discovery radio/);
  });
});
