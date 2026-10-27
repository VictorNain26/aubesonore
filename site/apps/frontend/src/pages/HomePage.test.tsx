// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { makeNowPlaying } from '../mocks/handlers';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { useNowPlayingStore } from '../lib/azuracast';
import { __resetNowPlayingStore } from '../lib/azuracast/store';
import { forgetHomeData } from '../lib/homeData';
import { useLocaleStore } from '../stores/localeStore';
import type { NowPlaying } from '../lib/azuracast';
import { routes } from '../routes';
import { PAGE_TEST_TIMEOUT, settle } from '../mocks/settle';

const API = 'http://localhost:3000';

/**
 * The site at its home page, its routes and loaders as it serves them, in the browser's history:
 * the page's language is its URL's (Paraglide), which the router moves.
 */
async function openHome() {
  window.history.replaceState(null, '', '/');
  const router = createBrowserRouter(routes);
  render(<RouterProvider router={router} />);
  await settle(router);
  return router;
}

beforeEach(() => {
  forgetHomeData();
  window.matchMedia = vi.fn().mockReturnValue({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
  const now = Math.floor(Date.now() / 1000);
  const np = makeNowPlaying() as unknown as NowPlaying;
  np.now_playing = { ...np.now_playing, sh_id: 7, played_at: now - 60 };
  np.now_playing.song = { ...np.now_playing.song, title: 'Nüchtern', artist: 'Die Sterne' };
  np.song_history = [
    {
      ...np.now_playing,
      sh_id: 6,
      played_at: now - 300,
      song: { ...np.now_playing.song, title: 'Mimoun', artist: 'Mickey 3D' },
    },
  ];
  useNowPlayingStore.setState({ data: np, isConnected: true, error: null });
  server.use(
    // The app's poller asks the live too: the same track.
    http.get('*/api/nowplaying_static/aubesonore.json', () => HttpResponse.json(np)),
    http.get(`${API}/api/trends`, () =>
      HttpResponse.json({
        week: [{ title: 'Oh No', artist: 'Foxygen', artworkUrl: null, likes: 2, artistPage: null }],
      })
    )
  );
});

afterEach(() => {
  window.history.replaceState(null, '', '/');
  __resetNowPlayingStore();
  useLocaleStore.getState().setLocale('fr');
});

describe('HomePage', { timeout: PAGE_TEST_TIMEOUT }, () => {
  it('puts the promise, the track on air, the one before it and the week on one page', async () => {
    await openHome();

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Une aube à chaque titre.');
    expect(screen.queryByText(/pas encore de nom/)).not.toBeInTheDocument();
    expect(screen.getAllByText('Nüchtern').length).toBeGreaterThan(0);
    const before = screen.getByRole('region', { name: 'Juste avant' });
    expect(before).toHaveTextContent('Mimoun');
    expect(before).not.toHaveTextContent('Nüchtern');
    expect(screen.queryByRole('heading', { name: 'Depuis l’aube' })).not.toBeInTheDocument();
    expect(screen.getAllByText('Oh No').length).toBeGreaterThan(0);
  });

  it('keeps the last cover dimmed off air, without its light', async () => {
    const np = useNowPlayingStore.getState().data!;
    np.now_playing.song.art = 'https://radio.aubesonore.fr/api/station/aubesonore/art/a1-1.jpg';
    useNowPlayingStore.setState({ data: { ...np, is_online: true } });
    await openHome();
    expect(screen.getAllByTestId('cover-light').length).toBeGreaterThan(0);

    act(() => useNowPlayingStore.setState({ data: { ...np, is_online: false } }));
    expect(screen.queryAllByTestId('cover-light')).toHaveLength(0);
    expect(screen.getByTestId('hero-cover')).toHaveAttribute('data-off-air');
  });

  it('switches the page to English from the footer', async () => {
    const router = await openHome();

    await userEvent.click(screen.getByRole('link', { name: 'en' }));
    await settle(router);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('A dawn with every track.');
  });

  it("names the site in the tab, not the page the listener came from, in the page's language", async () => {
    // What the tab says on arriving from another page (its server-drawn title, usePageTitle).
    document.title = 'Mentions légales et confidentialité · AubeSonore';
    const router = await openHome();

    expect(document.title).toBe('AubeSonore · Radio de découverte indé, électro, hip-hop');

    await userEvent.click(screen.getByRole('link', { name: 'en' }));
    await settle(router);
    expect(document.title).toBe('AubeSonore · Discovery radio: indie, electronic, hip-hop');
  });
});

/** The page's IntersectionObservers, each with what it watches, to tell one what it sees. */
function watchIntersections() {
  const observers: { callback: IntersectionObserverCallback; targets: Element[] }[] = [];
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      private readonly watched: { callback: IntersectionObserverCallback; targets: Element[] };
      constructor(callback: IntersectionObserverCallback) {
        this.watched = { callback, targets: [] };
        observers.push(this.watched);
      }
      observe(target: Element) {
        this.watched.targets.push(target);
      }
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    }
  );
  return {
    /** Tells the observer watching `element` (or a block holding it) whether it is on screen. */
    see(element: Element, isIntersecting: boolean) {
      const observer = observers.find((o) => o.targets.some((t) => t.contains(element)));
      if (!observer) throw new Error('nothing watches this element');
      act(() =>
        observer.callback(
          [{ isIntersecting } as IntersectionObserverEntry],
          {} as IntersectionObserver
        )
      );
    },
  };
}

describe('the player bar beside the hero', { timeout: PAGE_TEST_TIMEOUT }, () => {
  afterEach(() => vi.unstubAllGlobals());

  const bar = () => screen.getByRole('region', { name: 'Lecteur du direct', hidden: true });

  it("stays away while the hero's player is on screen, and comes once it has left", async () => {
    const intersections = watchIntersections();
    await openHome();
    const heroListen = within(screen.getByRole('main')).getByRole('button', {
      name: 'Écouter le direct',
    });

    expect(bar()).toHaveAttribute('inert');

    intersections.see(heroListen, false);
    expect(bar()).not.toHaveAttribute('inert');

    intersections.see(heroListen, true);
    expect(bar()).toHaveAttribute('inert');
  });

  it('is there from the start on a page without a player at its top', async () => {
    window.history.replaceState(null, '', '/mentions-legales');
    const router = createBrowserRouter(routes);
    render(<RouterProvider router={router} />);
    await settle(router);

    expect(bar()).not.toHaveAttribute('inert');
  });

  it('comes before the page in the keyboard order, right after the skip link', async () => {
    window.history.replaceState(null, '', '/mentions-legales');
    const router = createBrowserRouter(routes);
    render(<RouterProvider router={router} />);
    await settle(router);

    await userEvent.tab();
    expect(screen.getByRole('link', { name: 'Aller au contenu principal' })).toHaveFocus();
    await userEvent.tab();
    expect(within(bar()).getByRole('button', { name: 'Écouter le direct' })).toHaveFocus();
  });
});
