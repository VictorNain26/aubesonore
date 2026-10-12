import type { RouteObject } from 'react-router';
import App, { PageErrorScreen } from './App';
import { artistLoader } from './lib/artistPageData';
import { homeLoader } from './lib/homeData';
import HomePage from './pages/HomePage';
import { LegalPage } from './pages/LegalPage';
import { NotFoundPage } from './pages/NotFoundPage';

// Loaded when opened: the sign-in code, Musilogy and the listener's tracks are not needed to
// listen. Each page's data loader is declared here, apart from its code, so the two load together.
const artistPage = async () => ({ Component: (await import('./pages/ArtistPage')).default });
const musilogyPage = async () => ({ Component: (await import('./pages/MusilogyPage')).default });
const authPage = async () => ({ Component: (await import('./pages/AuthPage')).default });
const myTracksPage = async () => ({
  Component: (await import('./pages/MyTracksPage')).MyTracksPage,
});

/**
 * The site's routes, React Router's data mode (reactrouter.com/start/modes): a page is drawn once
 * its data has come (`loader`), so ScrollRestoration (App) puts the reader back at a page of its
 * full height. Rendered by createBrowserRouter in main.tsx and by createStaticHandler when
 * pre-rendering (entry-server.tsx), which runs no loader: the server draws from the data it is
 * given. A route with a loader has an id: main.tsx tells the router its first page needs none.
 */
export const routes: RouteObject[] = [
  {
    id: 'root',
    Component: App,
    children: [
      { id: 'home', path: '/', Component: HomePage, loader: homeLoader },
      { id: 'home-en', path: '/en', Component: HomePage, loader: homeLoader },
      {
        // A page chunk that fails to load (offline, a second failure inside the preloadReload
        // window) shows the page's error state in the site's frame, not a blank app. On a parent:
        // a route whose code did not load cannot be trusted with its own boundary.
        id: 'pages',
        ErrorBoundary: PageErrorScreen,
        children: [
          { id: 'artist', path: '/artiste/:slug', lazy: artistPage, loader: artistLoader },
          { id: 'artist-en', path: '/en/artist/:slug', lazy: artistPage, loader: artistLoader },
          { path: '/musilogy', lazy: musilogyPage },
          { path: '/en/musilogy', lazy: musilogyPage },
          { path: '/musilogy/:mbid/:slug?', lazy: musilogyPage },
          { path: '/en/musilogy/:mbid/:slug?', lazy: musilogyPage },
          { path: '/mes-titres', lazy: myTracksPage },
          { path: '/en/my-tracks', lazy: myTracksPage },
        ],
      },
      { path: '/connexion', lazy: authPage },
      { path: '/en/sign-in', lazy: authPage },
      { path: '/reset-password', lazy: authPage },
      { path: '/mentions-legales', Component: LegalPage },
      { path: '/en/legal', Component: LegalPage },
      { path: '*', Component: NotFoundPage },
    ],
  },
];
