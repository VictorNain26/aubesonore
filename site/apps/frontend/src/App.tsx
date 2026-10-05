import { lazy, Suspense, useEffect } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { Route, Routes, useLocation } from 'react-router';
import { ArtistPageView } from './artist/ArtistPageView';
import { AuthInit } from './components/AuthInit';
import { NowPlayingPoller } from './components/NowPlayingPoller';
import { PlayerSideEffects } from './components/Player/PlayerSideEffects';
import { PlayerBar } from './home/PlayerBar';
import { SiteFooter } from './home/SiteFooter';
import Layout from './layout/Layout';
import HomePage from './pages/HomePage';
import { NotFoundPage } from './pages/NotFoundPage';
import { LegalPage } from './pages/LegalPage';
import { MyTracksPage } from './pages/MyTracksPage';
import { useLocaleStore } from './stores/localeStore';

const ArtistPage = lazy(() => import('./pages/ArtistPage'));
const MusilogyPage = lazy(() => import('./pages/MusilogyPage'));
// Loaded when opened: the sign-in code is not needed to listen.
const AuthPage = lazy(() => import('./pages/AuthPage'));

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
  // In the frame of every page: the error fills the screen, with the footer under it.
  const pageError = (
    <div className="min-h-page flex flex-col">
      <ArtistPageView state={{ status: 'error' }} />
      <SiteFooter />
    </div>
  );

  const artist = (
    <ErrorBoundary fallback={pageError}>
      <Suspense fallback={null}>
        <ArtistPage />
      </Suspense>
    </ErrorBoundary>
  );

  const musilogy = (
    <ErrorBoundary fallback={pageError}>
      <Suspense fallback={null}>
        <MusilogyPage />
      </Suspense>
    </ErrorBoundary>
  );

  const auth = (
    <Suspense fallback={null}>
      <AuthPage />
    </Suspense>
  );

  return (
    <>
      <AuthInit />
      <NowPlayingPoller />
      <Layout>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/en" element={<HomePage />} />
          <Route path="/artiste/:slug" element={artist} />
          <Route path="/en/artist/:slug" element={artist} />
          <Route path="/musilogy" element={musilogy} />
          <Route path="/en/musilogy" element={musilogy} />
          <Route path="/musilogy/:mbid/:slug?" element={musilogy} />
          <Route path="/en/musilogy/:mbid/:slug?" element={musilogy} />
          <Route path="/mes-titres" element={<MyTracksPage />} />
          <Route path="/en/my-tracks" element={<MyTracksPage />} />
          <Route path="/connexion" element={auth} />
          <Route path="/en/sign-in" element={auth} />
          <Route path="/reset-password" element={auth} />
          <Route path="/mentions-legales" element={<LegalPage />} />
          <Route path="/en/legal" element={<LegalPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
        {/* Outside the routes: navigating between pages keeps the bar mounted. */}
        <PlayerBar />
        <PlayerSideEffects />
      </Layout>
    </>
  );
}
