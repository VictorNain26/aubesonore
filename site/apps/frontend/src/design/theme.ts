/**
 * The theme the listener chose: the system's (the device's day or night, the default), the day or
 * the night. Remembered on the device only, and drawn by tokens.css from `data-theme` on <html>.
 *
 * readThemeChoice and applyThemeChoice stand alone, naming nothing but their arguments and the
 * page: the build writes their source into the script <head> runs before the first paint
 * (themeHeadScript, vite.config.ts), an external file since the CSP allows no inline script.
 */
export const THEME_CHOICES = ['system', 'light', 'dark'] as const;
export type ThemeChoice = (typeof THEME_CHOICES)[number];

export const THEME_KEY = 'aubesonore-theme';

/** The remembered choice; the system's when there is none, or the storage cannot be read. */
export function readThemeChoice(key: string): ThemeChoice {
  try {
    const stored = localStorage.getItem(key);
    return stored === 'light' || stored === 'dark' ? stored : 'system';
  } catch {
    // Storage blocked (cookies refused, some private modes): reading it throws.
    return 'system';
  }
}

/**
 * The choice on the page: `data-theme` on <html> for a forced theme, none for the system's, and
 * the browser's bars (theme-color, one tag per scheme in index.html) turned with it.
 */
export function applyThemeChoice(choice: ThemeChoice): void {
  const root = document.documentElement;
  if (choice === 'system') delete root.dataset.theme;
  else root.dataset.theme = choice;
  document.querySelectorAll<HTMLMetaElement>('meta[data-scheme]').forEach((meta) => {
    const scheme = meta.dataset.scheme;
    meta.media =
      choice === 'system'
        ? `(prefers-color-scheme: ${scheme})`
        : choice === scheme
          ? 'all'
          : 'not all';
  });
}

/** The script <head> runs before the first paint: the remembered choice, applied. */
export function themeHeadScript(): string {
  return `(${applyThemeChoice.toString()})((${readThemeChoice.toString()})(${JSON.stringify(THEME_KEY)}));\n`;
}
