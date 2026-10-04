import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { paraglideVitePlugin } from '@inlang/paraglide-js';
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
      paraglideVitePlugin({
        project: './project.inlang',
        outdir: './src/paraglide',
        strategy: ['url', 'baseLocale'],
        emitTsDeclarations: true,
      }),
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
          'icon-32.png',
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
