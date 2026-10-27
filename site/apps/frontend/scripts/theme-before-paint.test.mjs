import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer } from 'vite';

// The pages as vite.config.ts writes them: the theme script must find the theme-color tags it turns.
const root = new URL('..', import.meta.url).pathname;
let server;

beforeAll(async () => {
  server = await createServer({
    root,
    configFile: `${root}vite.config.ts`,
    logLevel: 'silent',
    server: { middlewareMode: true, ws: false },
  });
});
afterAll(() => server?.close());

const page = (file) => server.transformIndexHtml(`/${file}`, readFileSync(`${root}${file}`, 'utf8'));

describe('the theme script in <head>', () => {
  it('runs after the theme-color tags, so a forced theme turns the browser bars', async () => {
    const html = await page('index.html');
    const script = html.search(/<script src="\/assets\/theme-[0-9a-f]{8}\.js"><\/script>/);
    expect(script).toBeGreaterThan(-1);
    expect(script).toBeGreaterThan(html.lastIndexOf('data-scheme='));
    // Still in <head>, before the page's own script: it runs before the first paint.
    expect(script).toBeLessThan(html.indexOf('</head>'));
  });
});
