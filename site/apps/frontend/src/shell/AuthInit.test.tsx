// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { useAuthStore } from '../stores/authStore';
import { useLikedTracksStore } from '../stores/likedTracksStore';
import { AuthInit } from './AuthInit';

const API = 'http://localhost:3000';

describe('AuthInit', () => {
  // Whoever uses the device next must not see the tracks the last listener kept.
  it("forgets the listener's kept tracks when they sign out", async () => {
    server.use(
      http.get(`${API}/api/auth/get-session`, () =>
        HttpResponse.json({
          user: { id: 'u1', email: 'listener@example.test', name: 'Listener' },
          session: { id: 's1' },
        })
      ),
      http.get(`${API}/api/track/like`, () =>
        HttpResponse.json([
          {
            id: 'k1',
            userId: 'u1',
            title: 'In Flight',
            artist: 'Sunflower Bean',
            album: null,
            artworkUrl: null,
            youtubeUrl: 'https://youtu.be/x',
            isrc: null,
            artistId: null,
            createdAt: '2026-01-01T00:00:00Z',
          },
        ])
      )
    );
    useAuthStore.setState({ user: null, isLoading: true, isAuthenticated: false, authError: null });
    useLikedTracksStore.setState({ tracks: [], isLoading: false, error: null });
    render(<AuthInit />);
    await waitFor(() => expect(useLikedTracksStore.getState().tracks).toHaveLength(1));

    await useAuthStore.getState().signOut();

    expect(useLikedTracksStore.getState().tracks).toEqual([]);
  });
});
