// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { getLocale } from '@/paraglide/runtime.js';
import { readLocaleChoice, useLocaleStore } from './localeStore';

afterEach(() => {
  useLocaleStore.getState().setLocale('fr');
});

describe('localeStore', () => {
  it('moves to /en/ and back to / without reloading', () => {
    window.history.replaceState(null, '', '/?x=1');

    useLocaleStore.getState().setLocale('en');
    expect(window.location.pathname).toBe('/en/');
    expect(window.location.search).toBe('?x=1');
    expect(getLocale()).toBe('en');
    expect(document.documentElement.lang).toBe('en');
    expect(readLocaleChoice()).toBe('en');

    useLocaleStore.getState().setLocale('fr');
    expect(window.location.pathname).toBe('/');
    expect(getLocale()).toBe('fr');
  });

  it("keeps the router's entry state when it swaps the URL", () => {
    window.history.replaceState({ idx: 3, key: 'k' }, '', '/musilogy');

    useLocaleStore.getState().setLocale('en');

    expect(window.location.pathname).toBe('/en/musilogy');
    expect(window.history.state).toEqual({ idx: 3, key: 'k' });
  });

  it.each([
    ['/artiste/hania-rani', '/en/artist/hania-rani'],
    ['/connexion', '/en/sign-in'],
    ['/mentions-legales/', '/en/legal/'],
  ])('swaps %s for its path in English, %s, and back', (french, english) => {
    window.history.replaceState(null, '', french);

    useLocaleStore.getState().setLocale('en');
    expect(window.location.pathname).toBe(english);

    useLocaleStore.getState().setLocale('fr');
    expect(window.location.pathname).toBe(french);
  });

  it('follows the URL when Back lands on the other language', () => {
    window.history.replaceState(null, '', '/artiste/hania-rani');
    useLocaleStore.getState().setLocale('en');
    // What the browser restores on Back, behind the store's back.
    window.history.replaceState(null, '', '/');

    useLocaleStore.getState().syncWithUrl();

    expect(useLocaleStore.getState().locale).toBe('fr');
    expect(getLocale()).toBe('fr');
    expect(document.documentElement.lang).toBe('fr');
  });
});
