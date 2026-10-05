// The head of a pre-rendered page: index.html's, with the page's language, title, description,
// address and sharing card. Only the tags that name the page change: the site's name, in the
// JSON-LD, og:site_name and the author, stays the site's. The JSON-LD describes the station in
// the page's language.

export const SITE = 'https://aubesonore.fr';

export function replaceOrFail(html, from, to) {
  if (!html.includes(from)) throw new Error(`prerender: "${from}" not found in index.html`);
  return html.replaceAll(from, to);
}

function alternates(pages) {
  return [
    ...pages.map((p) => `<link rel="alternate" hreflang="${p.locale}" href="${SITE}${p.path}" />`),
    `<link rel="alternate" hreflang="x-default" href="${SITE}${pages[0].path}" />`,
  ].join('\n    ');
}

/**
 * @param {string} template index.html as Vite built it
 * @param {{ title: string, description: string }} base the French home's title and description
 * @param {{ locale: string, path: string, title: string, description: string, station: string }} page
 *   `station`: the home's description in the page's language, the station's in the JSON-LD
 * @param {{ siblings: { locale: string, path: string }[], noindex?: boolean }} options
 */
export function rewriteHead(template, base, page, { siblings, noindex = false }) {
  let html = template;
  html = replaceOrFail(html, '<html lang="fr">', `<html lang="${page.locale}">`);
  html = replaceOrFail(html, `<title>${base.title}</title>`, `<title>${page.title}</title>`);
  for (const tag of ['property="og:title"', 'name="twitter:title"']) {
    html = replaceOrFail(
      html,
      `<meta ${tag} content="${base.title}" />`,
      `<meta ${tag} content="${page.title}" />`
    );
  }
  html = replaceOrFail(html, `content="${base.description}"`, `content="${page.description}"`);
  html = replaceOrFail(
    html,
    `"description": ${JSON.stringify(base.description)}`,
    `"description": ${JSON.stringify(page.station)}`
  );
  html = replaceOrFail(
    html,
    '"inLanguage": "fr-FR"',
    `"inLanguage": "${page.locale === 'fr' ? 'fr-FR' : 'en-GB'}"`
  );
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
  return replaceOrFail(
    html,
    `<link rel="canonical" href="${SITE}/" />`,
    noindex
      ? '<meta name="robots" content="noindex" />'
      : `<link rel="canonical" href="${SITE}${page.path}" />\n    ${alternates(siblings)}`
  );
}
