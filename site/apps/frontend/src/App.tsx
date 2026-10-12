import { useEffect } from 'react';
import { Outlet, ScrollRestoration, useLocation, type Location } from 'react-router';
import { PageError } from './artist/PageMessage';
import { AuthInit } from './components/AuthInit';
import { NowPlayingPoller } from './components/NowPlayingPoller';
import { PlayerSideEffects } from './components/Player/PlayerSideEffects';
import { PlayerBar } from './home/PlayerBar';
import { SiteFooter } from './home/SiteFooter';
import Layout from './layout/Layout';
import { useLocale, useLocaleStore } from './stores/localeStore';

/**
 * Where ScrollRestoration keeps a place (its getKey): the history entry, as by default, so a page
 * reached again through a link opens at the top (a key shared by path restores on every visit).
 * An anchor link (PageNav, the skip link) is a plain `<a href="#…">`, which the browser follows
 * with its own scroll and focus; its entry has no state, which React Router keys "default" like the
 * first page of the tab, and would put back that page's place over the anchor. Such entries are
 * keyed by the page and its anchor instead: back returns to the page's place.
 */
export function scrollKey(location: Location): string {
  return location.key === 'default' ? `${location.pathname}${location.hash}` : location.key;
}

/** A page that failed to load (its code, offline): its error, in the frame of every page. */
export function PageErrorScreen() {
  return (
    <div className="min-h-page flex flex-col">
      <PageError />
      <SiteFooter />
    </div>
  );
}

/**
 * The root route (routes.tsx): what every page shares, the page in its Outlet. React Router's
 * ScrollRestoration opens a new page at the top, or at its link's anchor, and puts the reader back
 * on back and forward once the page's data has come (reactrouter.com/api/components/
 * ScrollRestoration; in data mode without the framework it renders no script, so the CSP's
 * script-src 'self' holds).
 */
export default function App() {
  // Subscribing to the locale at the root re-renders the tree on language
  // change (no remount, no page reload — the stream keeps playing).
  useLocale();
  const syncWithUrl = useLocaleStore((s) => s.syncWithUrl);
  const { pathname } = useLocation();
  useEffect(() => syncWithUrl(), [pathname, syncWithUrl]);

  return (
    <>
      <AuthInit />
      <NowPlayingPoller />
      <Layout>
        <Outlet />
        {/* Outside the pages: navigating between them keeps the bar mounted. */}
        <PlayerBar />
        <PlayerSideEffects />
      </Layout>
      <ScrollRestoration getKey={scrollKey} />
    </>
  );
}
