// One set of Paraglide options for the Vite build, the Vitest run and the
// lint/typecheck compile (compile-i18n.mjs), so all three generate the same runtime.

/** @type {import('@inlang/paraglide-js').CompilerOptions} */
export const paraglideOptions = {
  project: './project.inlang',
  outdir: './src/paraglide',
  strategy: ['url', 'baseLocale'],
  // First match wins (paraglidejs.com/i18n-routing): the artist page has a path per language,
  // every other page the /en/ prefix.
  urlPatterns: [
    {
      pattern: '/artiste/:slug',
      localized: [
        ['en', '/en/artist/:slug'],
        ['fr', '/artiste/:slug'],
      ],
    },
    {
      pattern: '/:path(.*)?',
      localized: [
        ['en', '/en/:path(.*)?'],
        ['fr', '/:path(.*)?'],
      ],
    },
  ],
  emitTsDeclarations: true,
};
