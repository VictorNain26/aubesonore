import { defineConfig } from 'vitest/config';
import { paraglideVitePlugin } from '@inlang/paraglide-js';
import { paraglideOptions } from './scripts/paraglide-options.mjs';
import path from 'path';

export default defineConfig({
  plugins: [paraglideVitePlugin(paraglideOptions)],
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./src/mocks/setup.ts'],
    env: {
      VITE_API_URL: 'http://localhost:3000',
      VITE_AZURACAST_BASE_URL: 'https://radio.aubesonore.fr',
      VITE_STATION_SHORTCODE: 'aubesonore',
    },
    server: {
      deps: {
        inline: ['@testing-library/react'],
      },
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/mocks/**',
        // Visual-only / heavily DOM-coupled — covered by manual QA, not unit tests
        'src/App.tsx',
        'src/main.tsx',
        'src/sw.ts',
        'src/vite-env.d.ts',
        'src/pages/**',
        'src/shell/Layout.tsx',
        // Invisible hosts of side effects, mounted once in App
        'src/shell/AuthInit.tsx',
        'src/shell/NowPlayingPoller.tsx',
        'src/shell/PlayerSideEffects.tsx',
        // The player's hooks, covered by manual QA on the player
        'src/hooks/useLikeAction.ts',
        'src/hooks/useMediaSession.ts',
        'src/hooks/useTrackActions.ts',
        // External SDK wrappers — covered by browser, not unit tests
        'src/lib/cast/**',
        // Browser-only Cast/AirPlay event bridges (same rationale as lib/cast/**)
        'src/stores/castStore.ts',
      ],
      // Floor thresholds — ratchet up as coverage grows.
      // Current actual: ~85% statements/functions/lines, ~60% branches on remaining surface.
      thresholds: {
        statements: 70,
        branches: 50,
        functions: 70,
        lines: 70,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      react: path.resolve(__dirname, '../../node_modules/react'),
      'react-dom': path.resolve(__dirname, '../../node_modules/react-dom'),
      'react-dom/client': path.resolve(__dirname, '../../node_modules/react-dom/client'),
    },
    dedupe: ['react', 'react-dom'],
  },
});
