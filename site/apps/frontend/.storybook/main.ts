import { defineMain } from '@storybook/react-vite/node';
import type { PluginOption } from 'vite';

/**
 * The catalogue of the site's own components (README « Le catalogue »): built by the site's
 * vite.config.ts, so its Tailwind, Paraglide and `@` alias, minus what only the deployed site
 * needs: the service worker and its manifest (vite-plugin-pwa), the theme script it adds to its
 * pages (the toolbar's « Ciel » sets the theme here, .storybook/preview.tsx), and the site's three
 * pages as build inputs.
 */
const SITE_ONLY = ['vite-plugin-pwa', 'pages-without-pwa', 'theme-before-paint'];

function isSiteOnly(plugin: PluginOption): boolean {
  return (
    typeof plugin === 'object' &&
    plugin !== null &&
    'name' in plugin &&
    SITE_ONLY.some((name) => plugin.name.startsWith(name))
  );
}

function withoutSiteOnly(plugins: PluginOption[]): PluginOption[] {
  return plugins
    .map((plugin) => (Array.isArray(plugin) ? withoutSiteOnly(plugin) : plugin))
    .filter((plugin) => !isSiteOnly(plugin));
}

export default defineMain({
  framework: '@storybook/react-vite',
  stories: ['../src/**/*.mdx', '../src/**/*.stories.tsx'],
  // The docs pages (MDX, autodocs) and the accessibility panel (axe-core), both official.
  addons: ['@storybook/addon-docs', '@storybook/addon-a11y'],
  core: { disableTelemetry: true },
  viteFinal(config) {
    return {
      ...config,
      plugins: withoutSiteOnly(config.plugins ?? []),
      build: { ...config.build, rolldownOptions: {} },
      // The cover store's files (lib/artwork.ts) are made by the backend, which the catalogue runs
      // without: each goes back to the Cover Art Archive's image of the same size.
      server: {
        ...config.server,
        proxy: {
          '/covers/caa': {
            target: 'https://coverartarchive.org',
            changeOrigin: true,
            rewrite: (path: string) =>
              path.replace(/^\/covers\/caa\/([^/]+)\/(\d+)\.webp$/, '/release-group/$1/front-$2'),
          },
        },
      },
    };
  },
});
