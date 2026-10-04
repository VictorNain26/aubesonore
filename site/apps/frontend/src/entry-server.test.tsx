// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { meta, pageHtml, staticPageHtml } from './entry-server';

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

  it('renders the legal page with the publisher and the data controller', async () => {
    const fr = await staticPageHtml('legal', 'fr');
    expect(fr).toContain('Mentions légales et confidentialité');
    expect(fr).toContain('Victor Lenain');
    expect(fr).toContain('contact@aubesonore.fr');
    expect(await staticPageHtml('legal', 'en')).toContain('Legal notice and privacy');
  });

  it('renders a bilingual 404 that leads back to both home pages', async () => {
    const html = await staticPageHtml('notFound', 'fr');
    expect(html).toContain('Un blanc à l&#x27;antenne.');
    expect(html).toContain('href="/en/"');
  });

  it('gives each language its own title and description', () => {
    expect(meta('fr').title).toBe('AubeSonore');
    expect(meta('en').description).toMatch(/^A discovery radio/);
  });
});
