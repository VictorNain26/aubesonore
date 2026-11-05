import { defineConfig, devices } from '@playwright/test';

// The visual suite (visual/): each page captured whole and compared with its baseline, then axe.
// Baselines are drawn and compared in one environment only, the official image of the installed
// Playwright (mcr.microsoft.com/playwright:v<version>-noble, playwright.dev/docs/test-snapshots):
// fonts and anti-aliasing differ from one system to another. README « Captures et accessibilité ».

// A port of its own, apart from the dev server's 5173, on a shared machine.
const PORT = 5180;
const baseURL = `http://127.0.0.1:${PORT}`;

const phone = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };
const desktop = { viewport: { width: 1280, height: 800 } };

export default defineConfig({
  testDir: './visual',
  testMatch: '*.visual.ts',
  // One baseline per capture and project; no platform in the name: the image is the platform.
  snapshotPathTemplate: '{testDir}/__screenshots__/{arg}-{projectName}{ext}',
  outputDir: './test-results/visual',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never', outputFolder: 'playwright-report' }]]
    : 'list',
  expect: {
    // Pixel for pixel: in the same image the drawing is the same, and a token's small change of
    // colour must show (the default threshold, 0.2, lets a slight shade through).
    toHaveScreenshot: { animations: 'disabled', caret: 'hide', scale: 'css', threshold: 0 },
  },
  use: {
    baseURL,
    reducedMotion: 'reduce',
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
    serviceWorkers: 'block',
    deviceScaleFactor: 1,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'phone-day', use: { ...devices['Desktop Chrome'], ...phone, colorScheme: 'light' } },
    { name: 'phone-night', use: { ...devices['Desktop Chrome'], ...phone, colorScheme: 'dark' } },
    {
      name: 'desktop-day',
      use: { ...devices['Desktop Chrome'], ...desktop, colorScheme: 'light' },
    },
    {
      name: 'desktop-night',
      use: { ...devices['Desktop Chrome'], ...desktop, colorScheme: 'dark' },
    },
  ],
  webServer: {
    // Node itself, not pnpm: the Playwright image has Node and npm only (README « Captures et
    // accessibilité »). The workspace's Vite, hoisted to site/node_modules (site/.npmrc).
    command: `node ../../node_modules/vite/bin/vite.js --port ${PORT} --strictPort --host 127.0.0.1`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
    // The page asks its own origin for /api (answered by visual/network.ts) and the station at
    // its production address (answered there too): whatever a local .env says.
    env: {
      VITE_API_URL: '',
      VITE_AZURACAST_BASE_URL: 'https://radio.aubesonore.fr',
      VITE_STATION_SHORTCODE: 'aubesonore',
      API_PROXY_TARGET: '',
      PUBLIC_API_PROXY_TARGET: '',
    },
  },
});
