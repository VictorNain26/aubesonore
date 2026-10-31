import type { Decorator, Preview } from '@storybook/react-vite';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
// What src/main.tsx loads for the page's look: the same fonts, the same tokens.
import '@fontsource-variable/atkinson-hyperlegible-next';
import '@fontsource-variable/fraunces/opsz.css';
import '../src/index.css';
import { THEME_CHOICES, type ThemeChoice } from '../src/design/theme';
import { chooseTheme } from '../src/stores/themeStore';
import { baseLocale, locales, overwriteGetLocale, type Locale } from '../src/paraglide/runtime.js';

/** The toolbar's « Ciel »: the listener's choice, set as the footer's switch sets it. */
function Sky({ choice, children }: { choice: ThemeChoice; children: ReactNode }) {
  useEffect(() => chooseTheme(choice), [choice]);
  return children;
}

const withTheme: Decorator = (Story, { globals }) => (
  <Sky choice={(globals.theme ?? 'system') as ThemeChoice}>
    <Story />
  </Sky>
);

/** The toolbar's « Langue »: the messages read the locale when they render. */
const withLocale: Decorator = (Story, { globals }) => {
  const locale = (globals.locale ?? baseLocale) as Locale;
  overwriteGetLocale(() => locale);
  return <Story key={locale} />;
};

/**
 * The links of a view need a router; a story is one page of its own. The router is made once per
 * story, the story reaching it through a context: a router made on each render would remount the
 * story at every change of a control or of the toolbar, closing what its `play` opened.
 */
const StorySlot = createContext<ReactNode>(null);

function Slot() {
  return useContext(StorySlot);
}

function Routed({ children }: { children: ReactNode }) {
  const [router] = useState(() => createMemoryRouter([{ path: '*', element: <Slot /> }]));
  return (
    <StorySlot.Provider value={children}>
      <RouterProvider router={router} />
    </StorySlot.Provider>
  );
}

const withRouter: Decorator = (Story) => (
  <Routed>
    <Story />
  </Routed>
);

/** The widths the audit of 2026-10-29 walked through, from the smallest phone to a large screen. */
const WIDTHS = {
  w320: { name: '320 · petit téléphone', styles: { width: '320px', height: '640px' } },
  w390: { name: '390 · téléphone', styles: { width: '390px', height: '844px' } },
  w768: { name: '768 · tablette', styles: { width: '768px', height: '1024px' } },
  w1280: { name: '1280 · ordinateur', styles: { width: '1280px', height: '800px' } },
  w1440: { name: '1440 · ordinateur', styles: { width: '1440px', height: '900px' } },
  w2560: { name: '2560 · grand écran', styles: { width: '2560px', height: '1440px' } },
};

const preview: Preview = {
  // A documentation page for every component, from its props and its stories.
  tags: ['autodocs'],
  decorators: [withRouter, withLocale, withTheme],
  globalTypes: {
    theme: {
      description: 'Le ciel : celui de l’appareil, le jour ou la nuit',
      toolbar: {
        title: 'Ciel',
        items: THEME_CHOICES.map((value) => ({
          value,
          title: { system: 'Système', light: 'Jour', dark: 'Nuit' }[value],
        })),
        dynamicTitle: true,
      },
    },
    locale: {
      description: 'La langue des messages',
      toolbar: {
        title: 'Langue',
        items: locales.map((value) => ({ value, title: value })),
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: { theme: 'system', locale: baseLocale },
  parameters: {
    layout: 'fullscreen',
    // The site as a design system: what it is made of, then its parts, then its pages.
    options: {
      storySort: {
        order: [
          'Introduction',
          'Fondations',
          ['Couleurs', 'Typographie', 'Icônes', 'La ligne'],
          'Composants',
          'Coque',
          'Pages',
          ['Accueil', 'Artiste', 'Musilogy', 'Compte', 'Mes titres', 'Mentions légales', '404'],
        ],
      },
    },
    // Every story checked by axe-core; a violation shows as a warning in the panel. 'error' would
    // fail only through the Vitest addon, which runs tests in a browser: not used here.
    a11y: { test: 'todo' },
    viewport: { options: WIDTHS },
  },
};

export default preview;
