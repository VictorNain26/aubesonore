// Writes the site as static HTML so crawlers that do not run JavaScript (AI
// crawlers included) read the real pages. Runs after `vite build` (client)
// and `vite build --ssr src/entry-server.tsx`.
// Pre-rendering pattern: https://vite.dev/guide/ssr#pre-rendering-ssg
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const SITE = 'https://aubesonore.fr';
const { pageHtml, meta } = await import('../dist-ssr/entry-server.js');
const template = await readFile('dist/index.html', 'utf8');
const base = meta('fr');

// The stylesheets (~10 KB compressed) are inlined, in their order: a <link> would block the first
// paint for one more round trip, and the fonts would only be found after it. Vite splits a
// stylesheet the Cast receiver shares (the font) from the page's own, so there can be several.
// The title font is preloaded for the same reason.
const stylesheets = [
  ...template.matchAll(/<link rel="stylesheet"[^>]*href="(\/assets\/[^"]+\.css)"[^>]*>/g),
];
if (stylesheets.length === 0) throw new Error('prerender: no stylesheet link in index.html');
const css = (
  await Promise.all(stylesheets.map(([, href]) => readFile(`dist${href}`, 'utf8')))
).join('\n');
const titleFont = (await readdir('dist/assets')).find((f) =>
  f.startsWith('bricolage-grotesque-latin-wght-normal-')
);
if (!titleFont) throw new Error('prerender: title font not found in dist/assets');
const head = `<link rel="preload" href="/assets/${titleFont}" as="font" type="font/woff2" crossorigin />
    <style>${css}</style>`;

function replaceOrFail(html, from, to) {
  if (!html.includes(from)) throw new Error(`prerender: "${from}" not found in index.html`);
  return html.replaceAll(from, to);
}

/** The page's stylesheet links replaced by the inlined styles, where the first one was. */
function inlineStyles(html) {
  const [first, ...rest] = stylesheets.map(([link]) => link);
  let out = replaceOrFail(html, first, head);
  for (const link of rest) out = replaceOrFail(out, link, '');
  return out;
}

function alternates(pages) {
  return [
    ...pages.map((p) => `<link rel="alternate" hreflang="${p.locale}" href="${SITE}${p.path}" />`),
    `<link rel="alternate" hreflang="x-default" href="${SITE}${pages[0].path}" />`,
  ].join('\n    ');
}

async function write(page, body, { siblings, noindex = false }) {
  const { title, description } = meta(page.locale, page.kind);
  let html = template;
  html = replaceOrFail(html, '<html lang="fr">', `<html lang="${page.locale}">`);
  html = replaceOrFail(html, base.title, title);
  html = replaceOrFail(html, base.description, description);
  html = replaceOrFail(html, `${SITE}/og-fr.png`, `${SITE}/og-${page.locale}.png`);
  html = replaceOrFail(
    html,
    '<meta property="og:locale" content="fr_FR" />',
    `<meta property="og:locale" content="${page.locale === 'fr' ? 'fr_FR' : 'en_GB'}" />`
  );
  html = replaceOrFail(
    html,
    `<meta property="og:url" content="${SITE}/" />`,
    `<meta property="og:url" content="${SITE}${page.path}" />`
  );
  html = replaceOrFail(
    html,
    `<link rel="canonical" href="${SITE}/" />`,
    noindex
      ? '<meta name="robots" content="noindex" />'
      : `<link rel="canonical" href="${SITE}${page.path}" />\n    ${alternates(siblings)}`
  );
  html = inlineStyles(html);
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
await writeFile('dist/app.html', inlineStyles(template));
console.log('wrote dist/app.html');

await rm('dist-ssr', { recursive: true, force: true });
