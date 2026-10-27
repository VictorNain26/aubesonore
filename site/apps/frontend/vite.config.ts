import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { paraglideVitePlugin } from '@inlang/paraglide-js';
import { paraglideOptions } from './scripts/paraglide-options.mjs';
import { VitePWA } from 'vite-plugin-pwa';
import { visualizer } from 'rollup-plugin-visualizer';
import type { Plugin, PluginOption } from 'vite';
import path from 'path';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { themeHeadScript } from './src/design/theme';

// The installed app describes itself as the home page does (messages/fr.json, meta_description).
const { meta_description: description } = JSON.parse(
  readFileSync(new URL('./messages/fr.json', import.meta.url), 'utf8')
) as { meta_description: string };

// What a fresh database has no answer to: Musilogy, the artist pages and the trends. A listener's
// own data (session, kept tracks) and the artist links of the thread stay on the local backend.
const PUBLIC_READS = ['^/api/musilogy/', '^/api/artist/page/', '^/api/trends'];

/**
 * The listener's theme on the page before its first paint (src/design/theme.ts): a script in
 * <head>, after the theme-color tags it turns and ahead of the styles, which the browser runs
 * before drawing anything (scripts/theme-before-paint.test.mjs). A file of its own,
 * since the CSP allows no inline script, named by its content under /assets/ so nginx and the
 * service worker keep it for a year. The home page only: not the Cast receiver nor the page the
 * Google sign-in popup ends on.
 */
function themeBeforePaint(): Plugin {
  const source = themeHeadScript();
  const hash = createHash('sha256').update(source).digest('hex').slice(0, 8);
  const fileName = `assets/theme-${hash}.js`;
  let emits = false;
  return {
    name: 'theme-before-paint',
    configResolved(config) {
      emits = config.command === 'build' && !config.build.ssr;
    },
    buildStart() {
      if (emits) this.emitFile({ type: 'asset', fileName, source });
    },
    configureServer(server) {
      server.middlewares.use(`/${fileName}`, (_request, response) => {
        response.setHeader('Content-Type', 'text/javascript');
        response.end(source);
      });
    },
    transformIndexHtml: {
      order: 'pre',
      handler(_html, { path: page }) {
        if (page === '/cast/receiver.html' || page === '/auth/google.html') return;
        return [{ tag: 'script', attrs: { src: `/${fileName}` }, injectTo: 'head' }];
      },
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiBaseUrl = env.VITE_API_URL;
  // In compose.yaml's frontend-dev the page calls /api on its own origin and the backend sits
  // at API_PROXY_TARGET; PUBLIC_API_PROXY_TARGET, when set, relays the public reads to that API
  // (production's, read only) instead of the local database.
  const apiTarget = env.API_PROXY_TARGET || apiBaseUrl;
  const publicApi = env.PUBLIC_API_PROXY_TARGET;
  const coverTarget = publicApi || apiTarget;
  const analyze = env.ANALYZE === 'true';

  return {
    base: '/',
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    plugins: [
      react(),
      themeBeforePaint(),
      tailwindcss(),
      paraglideVitePlugin(paraglideOptions),
      VitePWA({
        strategies: 'injectManifest',
        srcDir: 'src',
        filename: 'sw.ts',
        registerType: 'autoUpdate',
        injectRegister: 'script-defer',
        // No HTML in the precache: the worker served the precached home until a new worker was
        // installed, so a deploy showed the previous site, and came back after a hard refresh.
        // Pages go to the network (nginx: no-cache); hashed scripts and styles stay precached.
        injectManifest: {
          globPatterns: ['**/*.{js,css}'],
          // Every page inlines its stylesheet (scripts/prerender.mjs), so main.css is never
          // fetched; the Cast receiver's files are for TVs, not listeners.
          globIgnores: ['**/main-*.css', '**/receiver-*'],
        },
        includeAssets: ['favicon.svg', 'favicon.ico', 'icon-180.png'],
        manifest: {
          name: 'AubeSonore',
          short_name: 'AubeSonore',
          description,
          lang: 'fr',
          categories: ['music'],
          theme_color: '#f1e5dc',
          background_color: '#f1e5dc',
          display: 'standalone',
          scope: '/',
          start_url: '/',
          icons: [
            {
              src: '/icon-192.png',
              sizes: '192x192',
              type: 'image/png',
            },
            {
              src: '/icon-512.png',
              sizes: '512x512',
              type: 'image/png',
            },
            {
              src: '/icon-maskable-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
      }),
      // vite-plugin-pwa injects its manifest and service worker into every page (BuildPlugin's
      // transformIndexHtml, v1.3.0): a TV opening the Cast receiver would install the site's
      // worker and precache all of it. The receiver page goes without them.
      {
        name: 'cast-receiver-without-pwa',
        apply: 'build',
        enforce: 'post',
        transformIndexHtml: {
          order: 'post',
          handler(html, { path: page }) {
            if (page !== '/cast/receiver.html') return html;
            return html
              .replace(/<link rel="manifest"[^>]*>/, '')
              .replace(/<script id="vite-plugin-pwa:register-sw"[^>]*><\/script>/, '');
          },
        },
      } satisfies PluginOption,
      ...(analyze
        ? [
            visualizer({
              filename: 'stats.html',
              gzipSize: true,
              brotliSize: true,
            }) as PluginOption,
          ]
        : []),
    ],
    server: {
      host: '0.0.0.0',
      port: 5173,
      proxy: {
        // First match wins (https://vite.dev/config/server-options#server-proxy): the public
        // reads before the rest of /api.
        ...(publicApi
          ? Object.fromEntries(
              PUBLIC_READS.map((path) => [path, { target: publicApi, changeOrigin: true }])
            )
          : {}),
        ...(apiTarget ? { '/api': { target: apiTarget, changeOrigin: true } } : {}),
        // nginx serves the cover store's files at /covers/ (nginx.conf); here every cover comes
        // from the backend route that makes them, the public API's when set (its store holds the
        // kept tracks' copies). preview.proxy defaults to this one
        // (https://vite.dev/config/preview-options#preview-proxy).
        ...(coverTarget
          ? {
              '/covers': {
                target: coverTarget,
                changeOrigin: true,
                rewrite: (path: string) => path.replace(/^\/covers\//, '/api/cover-store/'),
              },
            }
          : {}),
      },
      cors: {
        origin: true,
        credentials: true,
      },
    },
    // The server render ships as dist-ssr alone, in the renderer image: no node_modules there.
    // https://vite.dev/config/ssr-options#ssr-noexternal
    ssr: { noExternal: true },
    build: {
      sourcemap: false,
      rolldownOptions: {
        // The Cast receiver is a page of its own, which a TV opens (vite.dev/guide/build#multi-page-app),
        // and so is the page the Google sign-in popup ends on (src/auth/googleSignIn.ts).
        input: {
          main: path.resolve(__dirname, 'index.html'),
          receiver: path.resolve(__dirname, 'cast/receiver.html'),
          googleReturn: path.resolve(__dirname, 'auth/google.html'),
        },
        output: {
          // React alone, so that updating any other library leaves this chunk cached. The test
          // reads the package's own folder: pnpm's isolated layout names peers in its paths
          // (.pnpm/@base-ui+react@…_react-dom@…), which a bare `includes('react-dom')` matched.
          // https://rolldown.rs/in-depth/manual-code-splitting
          codeSplitting: {
            groups: [
              {
                name: 'react-vendor',
                test: /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/,
              },
            ],
          },
        },
      },
    },
  };
});
