import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { paraglideVitePlugin } from '@inlang/paraglide-js';
import { paraglideOptions } from './scripts/paraglide-options.mjs';
import { VitePWA } from 'vite-plugin-pwa';
import { visualizer } from 'rollup-plugin-visualizer';
import type { PluginOption } from 'vite';
import path from 'path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiBaseUrl = env.VITE_API_URL;
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
        },
        includeAssets: [
          'favicon.svg',
          'favicon.ico',
          'robots.txt',
          'sitemap.xml',
          'llms.txt',
          'icon-180.png',
        ],
        manifest: {
          name: 'AubeSonore',
          short_name: 'AubeSonore',
          description: "Des titres à l'aube de vous plaire.",
          lang: 'fr',
          theme_color: '#e8e0d7',
          background_color: '#e8e0d7',
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
      proxy: apiBaseUrl
        ? {
            '/api': {
              target: apiBaseUrl,
              changeOrigin: true,
            },
          }
        : undefined,
      cors: {
        origin: true,
        credentials: true,
      },
    },
    build: {
      sourcemap: false,
      rollupOptions: {
        // The Cast receiver is a page of its own, which a TV opens (vite.dev/guide/build#multi-page-app).
        input: {
          main: path.resolve(__dirname, 'index.html'),
          receiver: path.resolve(__dirname, 'cast/receiver.html'),
        },
        output: {
          manualChunks(id: string) {
            if (id.includes('node_modules')) {
              if (id.includes('react-dom') || id.endsWith('/react/index.js')) return 'react-vendor';
            }
            return undefined;
          },
        },
      },
    },
  };
});
