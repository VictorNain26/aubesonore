import { useSyncExternalStore } from 'react';
import { applyThemeChoice, THEME_KEY, type ThemeChoice } from '../design/theme';

// The page itself holds the choice: `data-theme` on <html>, which the script in <head> sets from
// the device's memory before the first paint (design/theme.ts). This store only changes it, and
// tells who draws with the scheme (CoverLight, HorizonLine) when the page turns.

export type ColorScheme = 'light' | 'dark';

const DARK = '(prefers-color-scheme: dark)';
const choiceListeners = new Set<() => void>();

export function themeChoice(): ThemeChoice {
  const theme = document.documentElement.dataset.theme;
  return theme === 'light' || theme === 'dark' ? theme : 'system';
}

/** The listener's choice: on the page at once, remembered on the device, the system's forgotten. */
export function chooseTheme(choice: ThemeChoice): void {
  try {
    if (choice === 'system') localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, choice);
  } catch {
    // Storage blocked: the choice holds for this page only.
  }
  applyThemeChoice(choice);
  for (const listener of choiceListeners) listener();
}

/** The scheme the page is drawn in: the listener's, else the device's. */
export function colorScheme(): ColorScheme {
  const choice = themeChoice();
  if (choice !== 'system') return choice;
  return window.matchMedia?.(DARK).matches ? 'dark' : 'light';
}

function subscribeChoice(listener: () => void): () => void {
  choiceListeners.add(listener);
  return () => choiceListeners.delete(listener);
}

/** Calls `listener` each time the page turns from day to night or back, whatever turned it. */
export function onColorSchemeChange(listener: () => void): () => void {
  let last = colorScheme();
  const check = () => {
    const now = colorScheme();
    if (now === last) return;
    last = now;
    listener();
  };
  const device = window.matchMedia?.(DARK);
  device?.addEventListener('change', check);
  const stopChoice = subscribeChoice(check);
  return () => {
    device?.removeEventListener('change', check);
    stopChoice();
  };
}

/** The listener's choice, for a control that shows it; the system's while the server renders. */
export function useThemeChoice(): ThemeChoice {
  return useSyncExternalStore(subscribeChoice, themeChoice, () => 'system');
}
