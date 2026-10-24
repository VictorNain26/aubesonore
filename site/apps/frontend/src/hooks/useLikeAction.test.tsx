// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import { useLikeAction } from './useLikeAction';
import { useLikedTracksStore } from '../stores/likedTracksStore';
import { useAuthStore } from '../stores/authStore';
import { MemoryRouter, useLocation } from 'react-router';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { takePendingKeep } from '../lib/pendingKeep';
import type { LikedTrack } from '../lib/api';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const mockedToastSuccess = vi.mocked(toast.success);
const mockedToastError = vi.mocked(toast.error);

const LIKE_URL = 'http://localhost:3000/api/track/like';

const kept: LikedTrack = {
  id: 'kept-1',
  userId: 'u1',
  title: 'Test Track',
  artist: 'Test Artist',
  album: null,
  artworkUrl: null,
  youtubeUrl: 'https://youtube.com/x',
  isrc: null,
  artistId: null,
  createdAt: '2026-01-01T00:00:00Z',
};

function renderWithLocation() {
  return renderHook(() => ({ like: useLikeAction(), location: useLocation() }), {
    wrapper: MemoryRouter,
  });
}

describe('useLikeAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ isAuthenticated: true });
    useLikedTracksStore.setState({ tracks: [], likingTrackId: null, error: null });
    takePendingKeep();
  });

  it('offers a "Découvrir" toast action leading to the artist page after a like', async () => {
    const { result } = renderHook(() => ({ like: useLikeAction(), location: useLocation() }), {
      wrapper: MemoryRouter,
    });

    await act(() => result.current.like.toggleLike('Test Track', 'Test Artist'));

    await waitFor(() => expect(mockedToastSuccess).toHaveBeenCalled());
    const [message, options] = mockedToastSuccess.mock.calls[0] as [
      string,
      { action: { label: string; onClick: () => void } },
    ];
    expect(message).toBe('Gardé.');
    expect(options.action.label).toBe('Voir Test Artist');

    act(() => options.action.onClick());
    expect(result.current.location.pathname).toBe('/artiste/test-artist');
  });

  it('shows a plain toast when the artist has no page', async () => {
    const { result } = renderHook(() => useLikeAction(), { wrapper: MemoryRouter });

    await act(() => result.current.toggleLike('Test Track', 'Unknown'));

    await waitFor(() => expect(mockedToastSuccess).toHaveBeenCalled());
    expect(mockedToastSuccess).toHaveBeenCalledWith('Gardé.');
  });

  it('reports a failed keep and leaves the track not kept', async () => {
    server.use(http.post(LIKE_URL, () => new HttpResponse(null, { status: 500 })));
    const { result } = renderWithLocation();

    await act(() => result.current.like.toggleLike('Test Track', 'Test Artist'));

    expect(mockedToastSuccess).not.toHaveBeenCalled();
    expect(mockedToastError).toHaveBeenCalledWith(
      'Le titre n’a pas pu être gardé. Réessayez.',
      expect.anything()
    );
    expect(useLikedTracksStore.getState().tracks).toHaveLength(0);
    expect(result.current.location.pathname).toBe('/');
  });

  it('reports a keep that never reached the server', async () => {
    server.use(http.post(LIKE_URL, () => HttpResponse.error()));
    const { result } = renderWithLocation();

    await act(() => result.current.like.toggleLike('Test Track', 'Test Artist'));

    expect(mockedToastSuccess).not.toHaveBeenCalled();
    expect(mockedToastError).toHaveBeenCalledTimes(1);
    expect(useLikedTracksStore.getState().tracks).toHaveLength(0);
  });

  it('sends a listener whose session ended to sign in, the track kept for after', async () => {
    server.use(http.post(LIKE_URL, () => HttpResponse.json({ error: 'x' }, { status: 401 })));
    const { result } = renderWithLocation();

    await act(() => result.current.like.toggleLike('Test Track', 'Test Artist'));

    expect(mockedToastSuccess).not.toHaveBeenCalled();
    expect(mockedToastError).not.toHaveBeenCalled();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(result.current.location.pathname).toBe('/connexion');
    expect(result.current.location.state).toMatchObject({ keepTitle: 'Test Track', from: '/' });
    expect(takePendingKeep()).toMatchObject({ title: 'Test Track', artist: 'Test Artist' });
    expect(useLikedTracksStore.getState().tracks).toHaveLength(0);
  });

  it('reports a failed unkeep and keeps the track', async () => {
    useLikedTracksStore.setState({ tracks: [kept] });
    server.use(http.delete(`${LIKE_URL}/kept-1`, () => new HttpResponse(null, { status: 500 })));
    const { result } = renderWithLocation();

    await act(() => result.current.like.toggleLike('Test Track', 'Test Artist'));

    expect(mockedToastSuccess).not.toHaveBeenCalled();
    expect(mockedToastError).toHaveBeenCalledWith(
      'Le titre n’a pas pu être retiré. Réessayez.',
      expect.anything()
    );
    expect(useLikedTracksStore.getState().tracks).toEqual([kept]);
  });

  it('sends a listener whose session ended to sign in on an unkeep', async () => {
    useLikedTracksStore.setState({ tracks: [kept] });
    server.use(http.delete(`${LIKE_URL}/kept-1`, () => new HttpResponse(null, { status: 401 })));
    const { result } = renderWithLocation();

    await act(() => result.current.like.toggleLike('Test Track', 'Test Artist'));

    expect(mockedToastSuccess).not.toHaveBeenCalled();
    expect(mockedToastError).not.toHaveBeenCalled();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(result.current.location.pathname).toBe('/connexion');
    expect(takePendingKeep()).toBeNull();
  });
});
