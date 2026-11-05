import { expect, test, type Page } from '@playwright/test';
import { expectNoNewViolations } from './axe';
import { NOW, serveScene, stubAudio, type Scene, type Stream } from './network';

// Every page of the site and the home page's states, as the listener meets them, in each of the
// four projects of playwright.config.ts (390 and 1280 px wide, by day and by night): one full-page
// capture compared with its baseline, then axe. The baselines are drawn in the official Playwright
// image only (README « Captures et accessibilité »).

interface Visit {
  path: string;
  scene?: Scene;
  stream?: Stream;
}

/** Opens a page in its scene, at NOW, and waits until everything it draws has come. */
async function open(page: Page, { path, scene = {}, stream = 'plays' }: Visit) {
  const baseURL = test.info().project.use.baseURL ?? '';
  const served = await serveScene(page.context(), baseURL, scene);
  await stubAudio(page, stream);
  await page.clock.setFixedTime(NOW);
  await page.goto(path);
  return served;
}

/**
 * The page at rest: no request pending, the fonts in, every image decoded. A lazy image is asked
 * now: below the screen it would come or not depending on the moment of the capture.
 */
async function settle(page: Page) {
  await page.waitForLoadState('networkidle');
  await page.evaluate(async () => {
    await document.fonts.ready;
    const images = [...document.images];
    for (const img of images) img.loading = 'eager';
    await Promise.all(images.map((img) => img.decode().catch(() => undefined)));
  });
  await page.waitForLoadState('networkidle');
}

/** The capture, then axe on the same page; the capture is soft so axe runs even when it differs. */
async function check(page: Page, name: string, unanswered: string[]) {
  await settle(page);
  await expect.soft(page).toHaveScreenshot(`${name}.png`, { fullPage: true });
  await expectNoNewViolations(page);
  expect(unanswered, 'API calls the scene does not answer').toEqual([]);
}

const heroListen = (page: Page, name: RegExp) =>
  page.locator('.hero-live').getByRole('button', { name });

test.describe('home', () => {
  test('on air, fr', async ({ page }) => {
    const { unanswered } = await open(page, { path: '/' });
    await expect(page.getByRole('heading', { name: 'I’ll Be Around' })).toBeVisible();
    await check(page, 'home-fr', unanswered);
  });

  test('on air, en', async ({ page }) => {
    const { unanswered } = await open(page, { path: '/en/' });
    await expect(heroListen(page, /^Listen live$/)).toBeVisible();
    await check(page, 'home-en', unanswered);
  });

  test('off air', async ({ page }) => {
    const { unanswered } = await open(page, { path: '/', scene: { live: 'off-air' } });
    await expect(page.getByRole('heading', { name: /Silence radio/ })).toBeVisible();
    await check(page, 'home-off-air', unanswered);
  });

  test('live unreachable', async ({ page }) => {
    const { unanswered } = await open(page, { path: '/', scene: { live: 'unreachable' } });
    await expect(page.getByRole('heading', { name: /Le direct ne répond pas/ })).toBeVisible();
    await check(page, 'home-unreachable', unanswered);
  });

  test('connecting', async ({ page }) => {
    const { unanswered } = await open(page, { path: '/', stream: 'never-answers' });
    await heroListen(page, /^Écouter le direct$/).click();
    await expect(heroListen(page, /^Connexion…$/)).toBeVisible();
    await check(page, 'home-connecting', unanswered);
  });

  test('playing', async ({ page }) => {
    const { unanswered } = await open(page, { path: '/' });
    await heroListen(page, /^Écouter le direct$/).click();
    await expect(heroListen(page, /^Arrêter le direct$/)).toBeVisible();
    await check(page, 'home-playing', unanswered);
  });

  test('reconnecting', async ({ page }) => {
    const { unanswered } = await open(page, { path: '/' });
    await heroListen(page, /^Écouter le direct$/).click();
    await expect(heroListen(page, /^Arrêter le direct$/)).toBeVisible();
    // The stream closes under the player (lib/player.ts, `ended`): it reconnects.
    await page.evaluate(() => {
      (window as unknown as { __audio: HTMLMediaElement }).__audio.dispatchEvent(
        new Event('ended')
      );
    });
    await expect(heroListen(page, /^Connexion…$/)).toBeVisible();
    await check(page, 'home-reconnecting', unanswered);
  });
});

test('artist page', async ({ page }) => {
  const { unanswered } = await open(page, { path: '/artiste/stereolab' });
  await expect(page.getByRole('heading', { level: 1, name: 'Stereolab' })).toBeVisible();
  await check(page, 'artist', unanswered);
});

test.describe('musilogy', () => {
  test('home', async ({ page }) => {
    const { unanswered } = await open(page, { path: '/musilogy' });
    await expect(page.getByPlaceholder('Un artiste ou un groupe')).toBeVisible();
    await check(page, 'musilogy', unanswered);
  });

  test('search', async ({ page }) => {
    const { unanswered } = await open(page, { path: '/musilogy' });
    await page.getByPlaceholder('Un artiste ou un groupe').fill('cassius');
    await expect(page.getByText('French electro dance duo')).toBeVisible();
    await page.getByPlaceholder('Un artiste ou un groupe').blur();
    await check(page, 'musilogy-search', unanswered);
  });
});

test.describe('my tracks', () => {
  test('signed out', async ({ page }) => {
    const { unanswered } = await open(page, { path: '/mes-titres' });
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await check(page, 'my-tracks-signed-out', unanswered);
  });

  test('signed in', async ({ page }) => {
    const { unanswered } = await open(page, { path: '/mes-titres', scene: { signedIn: true } });
    await expect(page.getByText('Let It Happen')).toBeVisible();
    await check(page, 'my-tracks-signed-in', unanswered);
  });
});

test('sign-in', async ({ page }) => {
  const { unanswered } = await open(page, { path: '/connexion' });
  await expect(page.getByRole('heading', { name: 'Se connecter' })).toBeVisible();
  await check(page, 'sign-in', unanswered);
});

test('legal', async ({ page }) => {
  const { unanswered } = await open(page, { path: '/mentions-legales' });
  await expect(page.getByRole('heading', { name: /Mentions légales/ })).toBeVisible();
  await check(page, 'legal', unanswered);
});

test('not found', async ({ page }) => {
  const { unanswered } = await open(page, { path: '/une-page-qui-n-existe-pas' });
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await check(page, 'not-found', unanswered);
});
