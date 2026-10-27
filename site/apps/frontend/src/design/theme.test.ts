// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyThemeChoice, readThemeChoice, THEME_KEY, themeHeadScript } from './theme';

const root = document.documentElement;

/** The head's two theme-color tags, as index.html writes them. */
function themeColors() {
  document.head.innerHTML = `
    <meta name="theme-color" data-scheme="light" media="(prefers-color-scheme: light)" content="#f1e5dc" />
    <meta name="theme-color" data-scheme="dark" media="(prefers-color-scheme: dark)" content="#151d33" />`;
  const [light, dark] = document.head.querySelectorAll('meta');
  return { light: light!, dark: dark! };
}

/** Storage the browser refuses to open (cookies blocked): reading `localStorage` itself throws. */
function blockStorage() {
  vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
    throw new DOMException('The operation is insecure.', 'SecurityError');
  });
}

beforeEach(() => {
  localStorage.removeItem(THEME_KEY);
  delete root.dataset.theme;
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('readThemeChoice', () => {
  it('follows the system when nothing is remembered', () => {
    expect(readThemeChoice(THEME_KEY)).toBe('system');
  });

  it('gives back each remembered choice', () => {
    for (const choice of ['light', 'dark', 'system'] as const) {
      localStorage.setItem(THEME_KEY, choice);
      expect(readThemeChoice(THEME_KEY)).toBe(choice);
    }
  });

  it('follows the system over a value it does not know', () => {
    localStorage.setItem(THEME_KEY, 'sepia');
    expect(readThemeChoice(THEME_KEY)).toBe('system');
  });

  it('follows the system when the storage cannot be read', () => {
    blockStorage();
    expect(readThemeChoice(THEME_KEY)).toBe('system');
  });
});

describe('applyThemeChoice', () => {
  it('marks a forced theme on <html> and turns the browser bars to it', () => {
    const { light, dark } = themeColors();

    applyThemeChoice('dark');
    expect(root.dataset.theme).toBe('dark');
    expect(dark.media).toBe('all');
    expect(light.media).toBe('not all');

    applyThemeChoice('light');
    expect(root.dataset.theme).toBe('light');
    expect(light.media).toBe('all');
    expect(dark.media).toBe('not all');
  });

  it('leaves the system to choose, the bars following the device again', () => {
    const { light, dark } = themeColors();
    applyThemeChoice('dark');

    applyThemeChoice('system');
    expect(root).not.toHaveAttribute('data-theme');
    expect(light.media).toBe('(prefers-color-scheme: light)');
    expect(dark.media).toBe('(prefers-color-scheme: dark)');
  });
});

describe('themeHeadScript', () => {
  // The script <head> runs before the first paint, as the build writes it (vite.config.ts), run in
  // the page's global scope: a function of it that named anything of its module would throw.
  const run = () => {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval, @typescript-eslint/no-unsafe-call -- the script's own text, as the browser runs it
    new Function(themeHeadScript())();
  };

  it('applies the remembered choice before the page paints', () => {
    const { dark } = themeColors();
    localStorage.setItem(THEME_KEY, 'dark');
    run();
    expect(root.dataset.theme).toBe('dark');
    expect(dark.media).toBe('all');
  });

  it('leaves the system theme when nothing is remembered', () => {
    themeColors();
    run();
    expect(root).not.toHaveAttribute('data-theme');
  });

  it('draws the page in the system theme, without an error, when the storage cannot be read', () => {
    themeColors();
    blockStorage();
    expect(run).not.toThrow();
    expect(root).not.toHaveAttribute('data-theme');
  });
});
