import { useCallback, useSyncExternalStore } from 'react';
import { useLocation, useNavigate } from 'react-router';
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
// setLocale() navigates there, which would kill the live stream; the site
// moves to the other language's URL through its router instead
// (useSwitchLocale), and this store re-renders from the app root. The <audio>
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
  /** The listener's choice, remembered; the URL follows it through the router (useSwitchLocale). */
  setLocale: (locale: Locale) => void;
  /** Back and forward can land on a URL of the other language: follow it, and say it on <html>. */
  syncWithUrl: () => void;
}

export const useLocaleStore = create<LocaleState>((set, get) => ({
  locale: getLocale(),
  setLocale: (locale) => {
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
    // Set even when the language is unchanged: on the first load of an English URL the store is
    // already English while the HTML served for it may say French (the dev server's index.html).
    document.documentElement.lang = locale;
    if (locale === get().locale) return;
    void setParaglideLocale(locale, { reload: false });
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

/**
 * Switches the page to another language: its URL in that language, reached through the router so
 * the page's data loads again in it (React Router's loaders), in place of the entry and where the
 * reader stands (`preventScrollReset`). No reload: the stream keeps playing.
 */
export function useSwitchLocale(): (locale: Locale) => void {
  const navigate = useNavigate();
  const { pathname, search, hash } = useLocation();
  return useCallback(
    (locale: Locale) => {
      useLocaleStore.getState().setLocale(locale);
      // The origin is a placeholder: only the path is localized.
      const url = localizeUrl(new URL(`${pathname}${search}${hash}`, 'http://aubesonore.local'), {
        locale,
      });
      void navigate(`${url.pathname}${url.search}${url.hash}`, {
        replace: true,
        preventScrollReset: true,
      });
    },
    [navigate, pathname, search, hash]
  );
}
