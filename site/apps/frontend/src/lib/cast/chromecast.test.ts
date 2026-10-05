// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const SDK = 'script[src*="cast_sender.js"]';

beforeEach(() => {
  vi.resetModules();
  document.head.innerHTML = '';
});

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(window, 'chrome');
});

describe('loadCastSdk', () => {
  it('asks Google for the SDK only once the page is idle, in Chromium', async () => {
    const idle: Array<() => void> = [];
    vi.stubGlobal('requestIdleCallback', (callback: () => void) => idle.push(callback));
    Object.assign(window, { chrome: {} });
    const { loadCastSdk } = await import('./chromecast');

    void loadCastSdk();
    expect(document.head.querySelector(SDK)).toBeNull();

    idle.forEach((callback) => callback());
    expect(document.head.querySelector(SDK)).not.toBeNull();
  });

  it('asks nothing outside Chromium', async () => {
    const { loadCastSdk } = await import('./chromecast');

    expect(await loadCastSdk()).toBe(false);
    expect(document.head.querySelector(SDK)).toBeNull();
  });
});
