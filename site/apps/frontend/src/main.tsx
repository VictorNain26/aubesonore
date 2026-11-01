import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import {
  createBrowserRouter,
  matchRoutes,
  RouterProvider,
  type RouteMatch,
  type HydrationState,
} from 'react-router';
import '@fontsource-variable/atkinson-hyperlegible-next';
import '@fontsource-variable/fraunces/opsz.css';
// The real italic, for the tagline alone (shell/SiteHeader.tsx): the browser fetches it only there.
import '@fontsource-variable/fraunces/opsz-italic.css';
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
 * The data of the page the server drew, so the router hydrates it without running a loader: its
 * code first (a page loaded when opened, resolved before hydrating, reactrouter.com decision « lazy
 * route modules »), then an artist page's data, seeded from what it embeds, or null for the home
 * page, pre-rendered without its lists, which it asks once drawn (HomePage). null when the page's
 * code fails to load: the router then loads the page itself and shows its error.
 */
async function hydrationOf(matches: RouteMatch[]): Promise<HydrationState | null> {
  try {
    await Promise.all(
      matches.map(async ({ route }) => {
        if (typeof route.lazy !== 'function') return;
        Object.assign(route, { ...(await route.lazy()), lazy: undefined });
      })
    );
  } catch {
    return null;
  }
  const locale = extractLocaleFromUrl(window.location.href) ?? baseLocale;
  return {
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
}

/**
 * The production home arrives pre-rendered (scripts/prerender.mjs), an artist page rendered by the
 * backend with its data: hydrated from it. Else (the dev server's empty root, a page the server
 * leaves to the client) the router loads the first page's code and data before drawing it.
 */
async function start(container: HTMLElement): Promise<void> {
  const artistPage = readArtistPageData(document);
  if (artistPage) seedArtistPage(artistPage);

  const matches = matchRoutes(routes, window.location) ?? [];
  const hydrationData = container.hasChildNodes() ? await hydrationOf(matches) : null;
  const router = createBrowserRouter(routes, hydrationData ? { hydrationData } : undefined);
  const app = (
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>
  );
  if (hydrationData) hydrateRoot(container, app);
  // Over a drawn page whose code failed, createRoot replaces the server's markup.
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
