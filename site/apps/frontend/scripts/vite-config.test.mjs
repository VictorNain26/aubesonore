import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, resolveConfig } from 'vite';

// The pages as vite.config.ts writes them.
const root = new URL('..', import.meta.url).pathname;
const configFile = `${root}vite.config.ts`;
let server;
let built;

// Loading the config runs its plugins' setup (Paraglide, Tailwind): seconds, more under the suite.
beforeAll(async () => {
  [server, built] = await Promise.all([
    createServer({
      root,
      configFile,
      logLevel: 'silent',
      server: { middlewareMode: true, ws: false },
    }),
    resolveConfig({ root, configFile, logLevel: 'silent' }, 'build'),
  ]);
}, 60_000);
afterAll(() => server?.close());

const page = (file) =>
  server.transformIndexHtml(`/${file}`, readFileSync(`${root}${file}`, 'utf8'));

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

describe('the pages that are not the app', () => {
  // What vite-plugin-pwa writes into every page it builds.
  const PWA =
    '<link rel="manifest" href="/manifest.webmanifest">' +
    '<script id="vite-plugin-pwa:register-sw" src="/registerSW.js" defer></script>';

  const stripped = (path) => {
    const plugin = built.plugins.find(({ name }) => name === 'pages-without-pwa');
    return plugin.transformIndexHtml.handler(`<head>${PWA}</head>`, { path });
  };

  it('go without the manifest and the service worker: the Cast receiver and the Google return', () => {
    expect(stripped('/cast/receiver.html')).toBe('<head></head>');
    expect(stripped('/auth/google.html')).toBe('<head></head>');
  });

  it('leaves them to the app', () => {
    expect(stripped('/index.html')).toBe(`<head>${PWA}</head>`);
  });
});
