import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import {
  createBrowserRouter,
  matchRoutes,
  RouterProvider,
  type HydrationState,
} from 'react-router';
import '@fontsource-variable/bricolage-grotesque';
import '@fontsource-variable/geist-mono';
import './index.css';
import { handlePreloadError } from './lib/preloadReload';
import { readLocaleChoice } from './stores/localeStore';
import { artistLoader, readArtistPageData, seedArtistPage, seenArtist } from './lib/artistPageData';
import { baseLocale, extractLocaleFromUrl } from './paraglide/runtime.js';
import { routes } from './routes';

const root = document.getElementById('root');

if (!root) {
  throw new Error('Root element not found');
}

window.addEventListener('vite:preloadError', () => {
  handlePreloadError(sessionStorage, () => window.location.reload(), Date.now());
});

/**
 * The page the document arrived at is drawn at once: its code first (a page loaded when opened,
 * resolved before hydrating, reactrouter.com decision « lazy route modules »), and no loader run
 * for it. The production home arrives pre-rendered (scripts/prerender.mjs), an artist page
 * rendered by the backend with its data, which seeds the page's cache; the others fetch their
 * own. Loaders serve the navigations that follow.
 */
async function start(container: HTMLElement): Promise<void> {
  const artistPage = readArtistPageData(document);
  if (artistPage) seedArtistPage(artistPage);

  const matches = matchRoutes(routes, window.location) ?? [];
  await Promise.all(
    matches.map(async ({ route }) => {
      if (typeof route.lazy !== 'function') return;
      Object.assign(route, { ...(await route.lazy()), lazy: undefined });
    })
  );
  // The page's data as the server drew it: an artist page's, seeded from what it embeds; null for
  // the home page, pre-rendered without its lists, which it asks once drawn (HomePage).
  const locale = extractLocaleFromUrl(window.location.href) ?? baseLocale;
  const hydrationData: HydrationState = {
    loaderData: Object.fromEntries(
      matches.flatMap(({ route, params }) =>
        route.loader && route.id
          ? [
              [
                route.id,
                route.loader === artistLoader ? seenArtist(params.slug ?? '', locale) : null,
              ],
            ]
          : []
      )
    ),
  };
  // Drawn by the server: hydrated from its data. Else (the dev server's empty root) the router
  // loads the first page's data itself before drawing it.
  const drawn = container.hasChildNodes();
  const router = createBrowserRouter(routes, drawn ? { hydrationData } : undefined);
  const app = (
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>
  );
  if (drawn) hydrateRoot(container, app);
  else createRoot(container).render(app);
}

if (window.location.pathname === '/' && readLocaleChoice() === 'en') {
  window.location.replace(`/en/${window.location.search}${window.location.hash}`);
} else {
  void start(root);
}

if (import.meta.env.DEV) {
  void import('web-vitals').then(({ onLCP, onCLS, onINP }) => {
    onLCP((m) => console.debug('[CWV] LCP', m));
    onCLS((m) => console.debug('[CWV] CLS', m));
    onINP((m) => console.debug('[CWV] INP', m));
  });
}
