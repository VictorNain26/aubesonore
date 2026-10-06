import { useSyncExternalStore } from 'react';
import { create } from 'zustand';
import {
  baseLocale,
  extractLocaleFromUrl,
  getLocale,
  localizeUrl,
  setLocale as setParaglideLocale,
  type Locale,
} from '@/paraglide/runtime.js';

// Each language has its own URL (/ and /en/, the url strategy). Paraglide's
// setLocale() navigates there, which would kill the live stream; this store
// swaps the URL in place, then re-renders from the app root. The <audio>
// element lives outside React (lib/player) so playback keeps going.

// The listener's last explicit choice, so a returning English listener who
// types aubesonore.fr lands on /en/ (see main.tsx).
const CHOICE_KEY = 'aubesonore-locale';

export function readLocaleChoice(): string | null {
  try {
    return localStorage.getItem(CHOICE_KEY);
  } catch {
    return null;
  }
}

interface LocaleState {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  /** Back and forward can land on a URL of the other language: follow it. */
  syncWithUrl: () => void;
}

export const useLocaleStore = create<LocaleState>((set, get) => ({
  locale: getLocale(),
  setLocale: (locale) => {
    // The router keeps its own entry state in history.state: keep it.
    window.history.replaceState(
      window.history.state,
      '',
      localizeUrl(window.location.href, { locale }).href
    );
    try {
      localStorage.setItem(CHOICE_KEY, locale);
    } catch {
      // private mode: the URL still carries the language
    }
    void setParaglideLocale(locale, { reload: false });
    document.documentElement.lang = locale;
    set({ locale });
  },
  syncWithUrl: () => {
    const locale = extractLocaleFromUrl(window.location.href) ?? baseLocale;
    if (locale === get().locale) return;
    void setParaglideLocale(locale, { reload: false });
    document.documentElement.lang = locale;
    set({ locale });
  },
}));

/**
 * The page's language, for a component that redraws when it changes. While the server renders and
 * while the client hydrates, React reads a store's server snapshot, which zustand takes from the
 * store's initial state (zustand/esm/react.mjs): the language of the first module load, French on
 * the server. getLocale() is the page's at both moments.
 */
export function useLocale(): Locale {
  return useSyncExternalStore(
    useLocaleStore.subscribe,
    () => useLocaleStore.getState().locale,
    getLocale
  );
}
