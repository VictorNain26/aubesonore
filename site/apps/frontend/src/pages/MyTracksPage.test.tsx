// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { Toaster, toast } from 'sonner';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { useAuthStore } from '../stores/authStore';
import { useLikedTracksStore } from '../stores/likedTracksStore';
import { useRemovingTracks } from '../library/removal';
import type { LikedTrack } from '../lib/api';
import { MyTracksPage } from './MyTracksPage';

const API = 'http://localhost:3000';
// This year: a date of another year shows its year.
const YEAR = new Date().getFullYear();

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
    createdAt: `${YEAR}-10-01T10:00:00.000Z`,
    ...values,
  };
}

const library = [
  kept('1', {
    title: 'One More Time',
    artist: 'Daft Punk',
    artistId: 'a',
    artistPage: { slug: 'daft-punk', name: 'Daft Punk' },
    createdAt: `${YEAR}-10-03T10:00:00.000Z`,
  }),
  kept('2', {
    title: 'Get Lucky',
    artist: 'Daft Punk feat. Pharrell Williams',
    artistId: 'a',
    artistPage: { slug: 'daft-punk', name: 'Daft Punk' },
    createdAt: `${YEAR}-10-01T10:00:00.000Z`,
  }),
  kept('3', { title: 'Nightcall', artist: 'Kavinsky', createdAt: `${YEAR}-10-02T10:00:00.000Z` }),
];

function Search() {
  return <output aria-label="search">{useLocation().search}</output>;
}

function open(path = '/mes-titres') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/mes-titres" element={<MyTracksPage />} />
      </Routes>
      <Search />
      <Toaster />
    </MemoryRouter>
  );
}

const titles = () =>
  within(screen.getByRole('list'))
    .getAllByRole('listitem')
    .map((row) => library.find((track) => row.textContent?.includes(track.title))?.title);

// A closed toast leaves the page 200 ms later on a timer of its own: a test waits for it, or the
// timer outlives the test environment.
async function toastGone() {
  await waitFor(() =>
    expect(screen.queryByRole('button', { name: 'Annuler' })).not.toBeInTheDocument()
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

  it('lists the kept tracks newest first, each artist leading to their page', async () => {
    signIn();
    open();

    await screen.findByText('Nightcall');
    expect(titles()).toEqual(['One More Time', 'Nightcall', 'Get Lucky']);
    // Kept as "Daft Punk feat. Pharrell Williams", shown under the name of the artist's page.
    expect(
      screen.getAllByRole('link', { name: 'Daft Punk' }).map((a) => a.getAttribute('href'))
    ).toEqual(['/artiste/daft-punk', '/artiste/daft-punk']);
    // An artist the antenna is not known to have played has no page: its name is not a link.
    expect(screen.getByText('Kavinsky')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Kavinsky' })).not.toBeInTheDocument();
    expect(screen.getByText('3 titres gardés')).toBeInTheDocument();
    await waitFor(() => expect(document.title).toBe('Mes titres · AubeSonore'));
  });

  it('sorts by a column on a click, reverses it on a second, and keeps it in the address', async () => {
    signIn();
    open();

    await screen.findByText('Nightcall');
    await userEvent.click(screen.getByRole('button', { name: 'Artiste' }));

    expect(titles()).toEqual(['One More Time', 'Get Lucky', 'Nightcall']);
    expect(screen.getByRole('button', { name: 'Artiste, ordre croissant' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByRole('status', { name: 'search' })).toHaveTextContent('?sort=artist');

    await userEvent.click(screen.getByRole('button', { name: 'Artiste, ordre croissant' }));
    expect(titles()).toEqual(['Nightcall', 'One More Time', 'Get Lucky']);
    expect(screen.getByRole('status', { name: 'search' })).toHaveTextContent(
      '?sort=artist&dir=desc'
    );

    await userEvent.click(screen.getByRole('button', { name: 'Titre' }));
    expect(titles()).toEqual(['Get Lucky', 'Nightcall', 'One More Time']);

    await userEvent.click(screen.getByRole('button', { name: 'Ajouté le' }));
    expect(titles()).toEqual(['One More Time', 'Nightcall', 'Get Lucky']);
    expect(screen.getByRole('status', { name: 'search' })).toBeEmptyDOMElement();
  });

  it('opens on the order its address names', async () => {
    signIn();
    open('/mes-titres?sort=title&dir=desc');

    await screen.findByText('Nightcall');
    expect(screen.getByRole('button', { name: 'Titre, ordre décroissant' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(titles()).toEqual(['One More Time', 'Nightcall', 'Get Lucky']);
  });

  it('finds a track by title or artist, and says so when none matches', async () => {
    signIn();
    open();

    await screen.findByText('Nightcall');
    const search = screen.getByRole('searchbox', { name: 'Rechercher dans mes titres' });
    await userEvent.type(search, 'pharrell');
    expect(titles()).toEqual(['Get Lucky']);
    expect(screen.getByText('1 sur 3')).toBeInTheDocument();

    await userEvent.clear(search);
    await userEvent.type(search, 'cassius');
    expect(screen.getByText('Aucun titre ne correspond à « cassius ».')).toBeInTheDocument();

    await userEvent.click(screen.getAllByRole('button', { name: 'Effacer la recherche' })[0]!);
    expect(titles()).toEqual(['One More Time', 'Nightcall', 'Get Lucky']);
  });

  it('plays each track on YouTube and dates it', async () => {
    signIn();
    open();

    expect(
      await screen.findByRole('link', { name: 'Écouter « Nightcall » sur YouTube' })
    ).toHaveAttribute('href', 'https://www.youtube.com/results?search_query=3');
    expect(screen.getByText('2 oct.')).toHaveAttribute('datetime', `${YEAR}-10-02T10:00:00.000Z`);
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
    // Even once the toast has left, nothing was removed.
    await toastGone();
    expect(deleted).toBe(false);
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
    await toastGone();
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
