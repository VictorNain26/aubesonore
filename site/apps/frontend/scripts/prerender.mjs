// Writes the site as static HTML so crawlers that do not run JavaScript (AI
// crawlers included) read the real pages. Runs after `vite build` (client)
// and `vite build --ssr src/entry-server.tsx`.
// Pre-rendering pattern: https://vite.dev/guide/ssr#pre-rendering-ssg
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { replaceOrFail, rewriteHead } from './head.mjs';

const { pageHtml, meta } = await import('../dist-ssr/entry-server.js');
const template = await readFile('dist/index.html', 'utf8');
const base = meta('fr');

// The stylesheet (~10 KB compressed) is inlined: a <link> would block the first
// paint for one more round trip, and the fonts would only be found after it.
// The title font is preloaded for the same reason.
const stylesheet = template.match(/<link rel="stylesheet"[^>]*href="(\/assets\/[^"]+\.css)"[^>]*>/);
if (!stylesheet) throw new Error('prerender: no stylesheet link in index.html');
const css = await readFile(`dist${stylesheet[1]}`, 'utf8');
const titleFont = (await readdir('dist/assets')).find((f) =>
  f.startsWith('bricolage-grotesque-latin-wdth-normal-')
);
if (!titleFont) throw new Error('prerender: title font not found in dist/assets');
const head = `<link rel="preload" href="/assets/${titleFont}" as="font" type="font/woff2" crossorigin />
    <style>${css}</style>`;

async function write(page, body, { siblings, noindex = false }) {
  const { title, description } = meta(page.locale, page.kind);
  let html = rewriteHead(template, base, { ...page, title, description }, { siblings, noindex });
  html = replaceOrFail(html, stylesheet[0], head);
  html = replaceOrFail(html, '<div id="root"></div>', `<div id="root">${body}</div>`);
  await mkdir(dirname(page.file), { recursive: true });
  await writeFile(page.file, html);
  console.log(`prerendered ${page.file}`);
}

const home = [
  { kind: 'home', locale: 'fr', path: '/', file: 'dist/index.html' },
  { kind: 'home', locale: 'en', path: '/en/', file: 'dist/en/index.html' },
];
const legal = [
  {
    kind: 'legal',
    locale: 'fr',
    path: '/mentions-legales/',
    file: 'dist/mentions-legales/index.html',
  },
  { kind: 'legal', locale: 'en', path: '/en/legal/', file: 'dist/en/legal/index.html' },
];

for (const page of home) await write(page, await pageHtml(page.locale), { siblings: home });
for (const page of legal) {
  await write(page, await pageHtml(page.locale, page.path), { siblings: legal });
}
// nginx serves these for any unknown path, under /en/ in English; the client hydrates them at
// that path, where no route matches either.
const notFound = [
  { kind: 'notFound', locale: 'fr', path: '/404', file: 'dist/404.html' },
  { kind: 'notFound', locale: 'en', path: '/en/404', file: 'dist/en/404.html' },
];
for (const page of notFound) {
  await write(page, await pageHtml(page.locale, page.path), { siblings: home, noindex: true });
}

// Artist pages are not pre-rendered: the backend reads this empty shell from
// the container and rewrites its head tags per artist (artistPage.routes.ts),
// then the client renders the page.
await writeFile('dist/app.html', replaceOrFail(template, stylesheet[0], head));
console.log('wrote dist/app.html');

await rm('dist-ssr', { recursive: true, force: true });
