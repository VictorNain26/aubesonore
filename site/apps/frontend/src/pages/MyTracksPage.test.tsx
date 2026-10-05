// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { Toaster, toast } from 'sonner';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { useAuthStore } from '../stores/authStore';
import { useLikedTracksStore } from '../stores/likedTracksStore';
import { useRemovingTracks } from '../library/removal';
import type { LikedTrack } from '../lib/api';
import { MyTracksPage } from './MyTracksPage';

const API = 'http://localhost:3000';

function kept(id: string, values: Partial<LikedTrack>): LikedTrack {
  return {
    id,
    userId: 'u1',
    title: `Track ${id}`,
    artist: 'Artist',
    album: null,
    artworkUrl: null,
    youtubeUrl: `https://www.youtube.com/results?search_query=${id}`,
    isrc: null,
    songlinkUrl: null,
    platformLinks: null,
    artistId: null,
    createdAt: '2026-10-01T10:00:00.000Z',
    ...values,
  };
}

const library = [
  kept('1', {
    title: 'One More Time',
    artist: 'Daft Punk',
    artistId: 'a',
    artistPage: { slug: 'daft-punk', name: 'Daft Punk' },
    createdAt: '2026-10-03T10:00:00.000Z',
  }),
  kept('2', {
    title: 'Get Lucky',
    artist: 'Daft Punk feat. Pharrell Williams',
    artistId: 'a',
    artistPage: { slug: 'daft-punk', name: 'Daft Punk' },
    createdAt: '2026-10-01T10:00:00.000Z',
  }),
  kept('3', { title: 'Nightcall', artist: 'Kavinsky', createdAt: '2026-10-02T10:00:00.000Z' }),
];

function open() {
  return render(
    <MemoryRouter initialEntries={['/mes-titres']}>
      <Routes>
        <Route path="/mes-titres" element={<MyTracksPage />} />
      </Routes>
      <Toaster />
    </MemoryRouter>
  );
}

function signIn() {
  useAuthStore.setState({
    user: {
      id: 'u1',
      email: 'jane@example.com',
      name: 'Jane',
      image: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    isAuthenticated: true,
    isLoading: false,
  });
}

beforeEach(() => {
  useLikedTracksStore.setState({ tracks: [], isLoading: false, error: null, likingTrackId: null });
  useRemovingTracks.setState({ ids: new Set() });
  server.use(http.get(`${API}/api/track/like`, () => HttpResponse.json(library)));
});

describe('MyTracksPage', () => {
  it('asks a visitor to sign in', () => {
    useAuthStore.setState({ user: null, isAuthenticated: false, isLoading: false });
    open();

    expect(screen.getByRole('heading', { level: 1, name: 'Mes titres' })).toBeInTheDocument();
    const signIn = screen.getAllByRole('link', { name: 'Se connecter' });
    expect(signIn.map((link) => link.getAttribute('href'))).toEqual(['/connexion', '/connexion']);
  });

  it('shows the kept tracks under their artist, whose name leads to their page', async () => {
    signIn();
    open();

    const daftPunk = await screen.findByRole('region', { name: 'Daft Punk' });
    expect(within(daftPunk).getByRole('link', { name: 'Daft Punk' })).toHaveAttribute(
      'href',
      '/artiste/daft-punk'
    );
    expect(
      within(daftPunk)
        .getAllByRole('listitem')
        .map((row) => row.textContent)
    ).toEqual([expect.stringContaining('One More Time'), expect.stringContaining('Get Lucky')]);
    // An artist the antenna is not known to have played has no page: its name is not a link.
    const kavinsky = screen.getByRole('region', { name: 'Kavinsky' });
    expect(within(kavinsky).queryByRole('link', { name: 'Kavinsky' })).not.toBeInTheDocument();
    expect(screen.getByText('3 titres gardés')).toBeInTheDocument();
    await waitFor(() => expect(document.title).toBe('Mes titres · AubeSonore'));
  });

  it('plays each track on YouTube and dates it', async () => {
    signIn();
    open();

    expect(
      await screen.findByRole('link', { name: 'Écouter « Nightcall » sur YouTube' })
    ).toHaveAttribute('href', 'https://www.youtube.com/results?search_query=3');
    expect(screen.getByText('gardé le 2 octobre')).toBeInTheDocument();
  });

  it('hides a removed track at once and brings it back on Annuler, without removing it', async () => {
    let deleted = false;
    server.use(
      http.delete(`${API}/api/track/like/:id`, () => {
        deleted = true;
        return HttpResponse.json({ message: 'ok' });
      })
    );
    signIn();
    open();

    await userEvent.click(
      await screen.findByRole('button', { name: 'Ne plus garder « Nightcall »' })
    );
    expect(screen.queryByText('Nightcall')).not.toBeInTheDocument();
    expect(screen.getByText('2 titres gardés')).toBeInTheDocument();

    await userEvent.click(await screen.findByRole('button', { name: 'Annuler' }));
    expect(screen.getByText('Nightcall')).toBeInTheDocument();
    expect(deleted).toBe(false);
  });

  it('keeps the artists in place while a removal can be undone', async () => {
    signIn();
    open();

    await userEvent.click(
      await screen.findByRole('button', { name: 'Ne plus garder « One More Time »' })
    );

    expect(
      screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)
    ).toEqual(['Daft Punk', 'Kavinsky']);
  });

  it('removes the track once the toast is dismissed (swiped away)', async () => {
    let deletedId: string | null = null;
    server.use(
      http.delete(`${API}/api/track/like/:id`, ({ params }) => {
        deletedId = params.id as string;
        return HttpResponse.json({ message: 'ok' });
      })
    );
    signIn();
    open();

    await userEvent.click(
      await screen.findByRole('button', { name: 'Ne plus garder « Nightcall »' })
    );
    await screen.findByRole('button', { name: 'Annuler' });
    act(() => {
      toast.dismiss();
    });

    await waitFor(() => expect(deletedId).toBe('3'));
    await waitFor(() =>
      expect(useLikedTracksStore.getState().tracks.map((t) => t.id)).toEqual(['1', '2'])
    );
  });

  it('says so when the library cannot be loaded, and loads it again on demand', async () => {
    let fail = true;
    server.use(
      http.get(`${API}/api/track/like`, () =>
        fail ? new HttpResponse(null, { status: 500 }) : HttpResponse.json(library)
      )
    );
    signIn();
    open();

    expect(await screen.findByText("Vos titres n'ont pas pu être chargés.")).toBeInTheDocument();
    fail = false;
    await userEvent.click(screen.getByRole('button', { name: 'Réessayer' }));

    expect(await screen.findByText('Nightcall')).toBeInTheDocument();
  });
});
