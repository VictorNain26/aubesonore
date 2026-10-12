// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { act, render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { getLocale, type Locale } from '@/paraglide/runtime.js';
import { readLocaleChoice, useLocaleStore, useSwitchLocale } from './localeStore';

afterEach(() => {
  window.history.replaceState(null, '', '/');
  useLocaleStore.getState().setLocale('fr');
});

/** A router at `entry` and the site's language switch inside it. */
function atPage(entry: string) {
  let switchTo: (locale: Locale) => void = () => undefined;
  function Switch() {
    switchTo = useSwitchLocale();
    return null;
  }
  const router = createMemoryRouter([{ path: '*', Component: Switch }], {
    initialEntries: ['/start', entry],
    initialIndex: 1,
  });
  render(<RouterProvider router={router} />);
  return {
    router,
    to: (locale: Locale) => act(() => switchTo(locale)),
  };
}

describe('the language switch', () => {
  it('moves to /en/ and back to / through the router, in place of the entry, the query kept', () => {
    const { router, to } = atPage('/?x=1');

    to('en');
    expect(router.state.location.pathname).toBe('/en/');
    expect(router.state.location.search).toBe('?x=1');
    // In place: back still leads where it led before.
    expect(router.state.historyAction).toBe('REPLACE');
    expect(readLocaleChoice()).toBe('en');
    expect(document.documentElement.lang).toBe('en');

    to('fr');
    expect(router.state.location.pathname).toBe('/');
  });

  it.each([
    ['/artiste/hania-rani', '/en/artist/hania-rani'],
    ['/connexion', '/en/sign-in'],
    ['/mentions-legales/', '/en/legal/'],
  ])('swaps %s for its path in English, %s, and back', (french, english) => {
    const { router, to } = atPage(french);

    to('en');
    expect(router.state.location.pathname).toBe(english);

    to('fr');
    expect(router.state.location.pathname).toBe(french);
  });
});

describe('localeStore', () => {
  it('follows the URL when Back lands on the other language', () => {
    window.history.replaceState(null, '', '/en/artist/hania-rani');
    useLocaleStore.getState().setLocale('en');
    // What the browser restores on Back.
    window.history.replaceState(null, '', '/');

    useLocaleStore.getState().syncWithUrl();

    expect(useLocaleStore.getState().locale).toBe('fr');
    expect(getLocale()).toBe('fr');
    expect(document.documentElement.lang).toBe('fr');
  });
});
