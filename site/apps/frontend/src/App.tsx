import { lazy, Suspense, useEffect } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { Route, Routes, useLocation } from 'react-router';
import { ArtistPageView } from './artist/ArtistPageView';
import { MusilogyArtistView } from './musilogy/MusilogyView';
import { AuthInit } from './components/AuthInit';
import { AuthModalHost } from './components/AuthModalHost';
import { NowPlayingPoller } from './components/NowPlayingPoller';
import { PlayerSideEffects } from './components/Player/PlayerSideEffects';
import { PlayerBar } from './home/PlayerBar';
import Layout from './layout/Layout';
import HomePage from './pages/HomePage';
import { NotFoundPage } from './pages/NotFoundPage';
import { LegalPage } from './pages/LegalPage';
import { useLocaleStore } from './stores/localeStore';

const ArtistPage = lazy(() => import('./pages/ArtistPage'));
const MusilogyPage = lazy(() => import('./pages/MusilogyPage'));

/** Rendered inside a router: BrowserRouter in main.tsx, StaticRouter when pre-rendering. */
export default function App() {
  // Subscribing to the locale at the root re-renders the tree on language
  // change (no remount, no page reload — the stream keeps playing).
  useLocaleStore((s) => s.locale);
  const syncWithUrl = useLocaleStore((s) => s.syncWithUrl);
  const { pathname } = useLocation();
  useEffect(() => syncWithUrl(), [pathname, syncWithUrl]);

  // A page chunk that fails to load (offline, a second failure inside the
  // preloadReload window) shows the page's error state, not a blank app.
  const artist = (
    <ErrorBoundary fallback={<ArtistPageView state={{ status: 'error' }} />}>
      <Suspense fallback={null}>
        <ArtistPage />
      </Suspense>
    </ErrorBoundary>
  );

  const musilogy = (
    <ErrorBoundary fallback={<MusilogyArtistView state={{ status: 'error' }} />}>
      <Suspense fallback={null}>
        <MusilogyPage />
      </Suspense>
    </ErrorBoundary>
  );

  return (
    <>
      <AuthInit />
      <NowPlayingPoller />
      <Layout>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/en" element={<HomePage />} />
          <Route path="/reset-password" element={<HomePage />} />
          <Route path="/artist/:id/:slug?" element={artist} />
          <Route path="/en/artist/:id/:slug?" element={artist} />
          <Route path="/musilogy" element={musilogy} />
          <Route path="/en/musilogy" element={musilogy} />
          <Route path="/musilogy/:mbid/:slug?" element={musilogy} />
          <Route path="/en/musilogy/:mbid/:slug?" element={musilogy} />
          <Route path="/mentions-legales" element={<LegalPage />} />
          <Route path="/en/legal" element={<LegalPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
        {/* Outside the routes: navigating between pages keeps the bar mounted. */}
        <PlayerBar />
        <PlayerSideEffects />
      </Layout>
      <AuthModalHost />
    </>
  );
}
