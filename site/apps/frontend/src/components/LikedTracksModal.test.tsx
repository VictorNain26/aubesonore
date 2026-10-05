// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { useAuthStore } from '../stores/authStore';
import { LikedTracksModal } from './LikedTracksModal';
import { useLikedTracksStore } from '../stores/likedTracksStore';
import type { LikedTrack } from '../lib/api';

function makeTrack(index: number): LikedTrack {
  return {
    id: `track-${index}`,
    userId: 'u1',
    title: `Track ${index}`,
    artist: `Artist ${index}`,
    album: null,
    artworkUrl: null,
    youtubeUrl: `https://youtube.com/watch?v=${index}`,
    isrc: null,
    songlinkUrl: null,
    platformLinks: null,
    artistId: null,
    createdAt: new Date(2024, 0, index + 1).toISOString(),
  };
}

const signOut = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  useAuthStore.setState({
    user: {
      id: 'u1',
      email: 'jane@example.com',
      name: 'Jane',
      image: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    isAuthenticated: true,
    isLoading: false,
    authError: null,
    signOut,
  });
  useLikedTracksStore.setState({
    tracks: [],
    isLoading: false,
    error: null,
    likingTrackId: null,
  });
  // The modal refetches liked tracks on open; keep the mocked GET consistent
  // with whatever the test placed in the store so the refetch is a no-op.
  server.use(
    http.get('http://localhost:3000/api/track/like', () =>
      HttpResponse.json(useLikedTracksStore.getState().tracks)
    )
  );
});

describe('LikedTracksModal', () => {
  // The bound is 50 rows; a page of 3 exercises the same logic without rendering 60 rows.
  it('renders one page of rows plus a button to reveal the remaining tracks', async () => {
    useLikedTracksStore.setState({ tracks: Array.from({ length: 5 }, (_, i) => makeTrack(i)) });
    render(<LikedTracksModal isOpen={true} onClose={vi.fn()} pageSize={3} />);

    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    await userEvent.click(screen.getByRole('button', { name: /afficher les 2 autres/i }));

    expect(screen.getAllByRole('listitem')).toHaveLength(5);
    expect(
      screen.queryByRole('button', { name: /afficher les .* autres/i })
    ).not.toBeInTheDocument();
  });

  it('shows one page again when the drawer is closed and reopened', async () => {
    useLikedTracksStore.setState({ tracks: Array.from({ length: 5 }, (_, i) => makeTrack(i)) });
    const { rerender } = render(<LikedTracksModal isOpen={true} onClose={vi.fn()} pageSize={3} />);

    await userEvent.click(screen.getByRole('button', { name: /afficher les 2 autres/i }));
    expect(screen.getAllByRole('listitem')).toHaveLength(5);

    rerender(<LikedTracksModal isOpen={false} onClose={vi.fn()} pageSize={3} />);
    rerender(<LikedTracksModal isOpen={true} onClose={vi.fn()} pageSize={3} />);

    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });

  it('has no show-more button when everything fits in a page', () => {
    useLikedTracksStore.setState({ tracks: Array.from({ length: 3 }, (_, i) => makeTrack(i)) });
    render(<LikedTracksModal isOpen={true} onClose={vi.fn()} pageSize={3} />);

    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(
      screen.queryByRole('button', { name: /afficher les .* autres/i })
    ).not.toBeInTheDocument();
  });

  it('names itself like the button that opens it, without the account in it', () => {
    useLikedTracksStore.setState({ tracks: [makeTrack(0)] });
    render(<LikedTracksModal isOpen={true} onClose={vi.fn()} />);

    expect(screen.getByRole('dialog', { name: 'Mes titres' })).toBeInTheDocument();
    expect(screen.getByText('1 titre gardé')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Se déconnecter' })).not.toBeInTheDocument();
  });

  it('dates each kept track and plays it on YouTube', () => {
    useLikedTracksStore.setState({
      tracks: [{ ...makeTrack(0), platformLinks: { deezer: 'https://www.deezer.com/track/y' } }],
    });
    render(<LikedTracksModal isOpen={true} onClose={vi.fn()} />);

    expect(screen.getByText('gardé le 1 janvier')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Écouter « Track 0 » sur YouTube' })).toHaveAttribute(
      'href',
      'https://youtube.com/watch?v=0'
    );
    expect(screen.getByRole('button', { name: 'Ne plus garder « Track 0 »' })).toHaveTextContent(
      'Retirer'
    );
  });

  it('counts nothing when the library is empty', async () => {
    render(<LikedTracksModal isOpen={true} onClose={vi.fn()} />);

    expect(await screen.findByText("Rien de gardé pour l'instant.")).toBeInTheDocument();
    expect(screen.queryByText(/titres? gardés?$/)).not.toBeInTheDocument();
  });

  it('keeps the track visible with an inline Undo on delete, and cancels the removal on undo', async () => {
    useLikedTracksStore.setState({ tracks: [makeTrack(0)] });
    render(<LikedTracksModal isOpen={true} onClose={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Ne plus garder « Track 0 »' }));

    // The track stays in the store (pending), the row shows the inline Undo.
    expect(useLikedTracksStore.getState().tracks).toHaveLength(1);
    const undoButton = await screen.findByRole('button', { name: 'Annuler' });

    await userEvent.click(undoButton);

    expect(useLikedTracksStore.getState().tracks).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Annuler' })).not.toBeInTheDocument();
  });

  it('shows a countdown bar while a removal is pending, and removes it on undo', async () => {
    useLikedTracksStore.setState({ tracks: [makeTrack(0)] });
    render(<LikedTracksModal isOpen={true} onClose={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Ne plus garder « Track 0 »' }));

    const bar = await screen.findByRole('progressbar', {
      name: 'Temps restant avant suppression',
    });
    const valueNow = Number(bar.getAttribute('aria-valuenow'));
    expect(valueNow).toBeGreaterThan(90);
    expect(valueNow).toBeLessThanOrEqual(100);

    await userEvent.click(screen.getByRole('button', { name: 'Annuler' }));

    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('fires the unlike request only after the grace period elapses', async () => {
    let deleteCalled = false;
    server.use(
      http.delete('http://localhost:3000/api/track/like/:id', () => {
        deleteCalled = true;
        return HttpResponse.json({ message: 'ok' });
      })
    );
    vi.useFakeTimers();
    try {
      useLikedTracksStore.setState({ tracks: [makeTrack(0)] });
      render(<LikedTracksModal isOpen={true} onClose={vi.fn()} />);

      fireEvent.click(screen.getByRole('button', { name: 'Ne plus garder « Track 0 »' }));
      // Within the grace period the removal has not been committed yet.
      expect(deleteCalled).toBe(false);

      await vi.advanceTimersByTimeAsync(5000);

      expect(deleteCalled).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
