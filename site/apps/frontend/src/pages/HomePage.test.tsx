// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { makeNowPlaying } from '../mocks/handlers';
import { renderWithProviders } from '../test-utils';
import { useNowPlayingStore, __resetNowPlayingStore } from '../lib/azuracast';
import { useLocaleStore } from '../stores/localeStore';
import type { NowPlaying } from '../lib/azuracast';
import HomePage from './HomePage';

const API = 'http://localhost:3000';

// The app root subscribes to the locale so a language switch re-renders the tree.
function Root() {
  useLocaleStore((s) => s.locale);
  return <HomePage />;
}

beforeEach(() => {
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
  __resetNowPlayingStore();
  useLocaleStore.getState().setLocale('fr');
});

describe('HomePage', () => {
  it('puts the promise, the track on air, the thread and the ranking on one page', async () => {
    renderWithProviders(<Root />);

    expect(
      screen.getByRole('heading', { name: /Des titres à l'aube de vous plaire\./ })
    ).toBeInTheDocument();
    expect(screen.getAllByText('Nüchtern').length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { name: "Depuis l'aube" })).toBeInTheDocument();
    expect(await screen.findByText('Oh No')).toBeInTheDocument();
    expect(screen.getByText('gardé 2 fois')).toBeInTheDocument();
  });

  it('switches the page to English from the footer', async () => {
    renderWithProviders(<Root />);

    await userEvent.click(screen.getByRole('button', { name: 'en' }));

    expect(
      await screen.findByRole('heading', { name: /The first light of your next favourite songs\./ })
    ).toBeInTheDocument();
  });

  it('opens the about panel from the footer', async () => {
    renderWithProviders(<Root />);

    await userEvent.click(screen.getByRole('button', { name: 'À propos' }));

    const about = await screen.findByRole('dialog', { name: 'AubeSonore' });
    expect(about).toHaveTextContent(/discothèque de référence/);
    expect(about).not.toHaveTextContent(/Music Technology Group/);
  });
});
