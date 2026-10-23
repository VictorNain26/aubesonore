// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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
  np.song_history = [];
  useNowPlayingStore.setState({ data: np, isConnected: true, error: null });
  server.use(
    // The app's poller asks the live too: the same track.
    http.get('*/api/nowplaying_static/aubesonore.json', () => HttpResponse.json(np)),
    http.get(`${API}/api/radio/history`, () => HttpResponse.json([])),
    http.get(`${API}/api/trends`, () =>
      HttpResponse.json({
        week: [{ title: 'Oh No', artist: 'Foxygen', artworkUrl: null, likes: 2, artistPage: null }],
        allTime: [],
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
  it('puts the promise, the track on air, the thread and the ranking on one page', async () => {
    await openHome();

    expect(
      screen.getByRole('heading', { name: /Des titres à l'aube de vous plaire\./ })
    ).toBeInTheDocument();
    expect(screen.getAllByText('Nüchtern').length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { name: "Depuis l'aube" })).toBeInTheDocument();
    expect(screen.getByText('Oh No')).toBeInTheDocument();
    expect(screen.getByText('gardé 2 fois')).toBeInTheDocument();
  });

  it('switches the page to English from the footer', async () => {
    const router = await openHome();

    await userEvent.click(screen.getByRole('link', { name: 'en' }));
    await settle(router);

    expect(
      screen.getByRole('heading', { name: /The first light of your next favourite songs\./ })
    ).toBeInTheDocument();
  });
});
