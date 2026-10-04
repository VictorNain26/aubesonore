// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/server';
import { useLikedTracksStore, isTrackLiked } from './likedTracksStore';

beforeEach(() => {
  useLikedTracksStore.setState({
    tracks: [],
    isLoading: false,
    error: null,
    likingTrackId: null,
  });
});

describe('likedTracksStore', () => {
  it('rolls back optimistic like on server error', async () => {
    server.use(
      http.post(
        'http://localhost:3000/api/track/like',
        () => new HttpResponse(null, { status: 500 })
      )
    );

    await useLikedTracksStore.getState().likeTrack({
      title: 'T',
      artist: 'A',
      youtubeUrl: 'https://youtube.com/x',
    });

    expect(useLikedTracksStore.getState().tracks).toHaveLength(0);
    expect(useLikedTracksStore.getState().error).not.toBeNull();
  });

  it('keeps optimistic track on success and replaces temp id with server id', async () => {
    await useLikedTracksStore.getState().likeTrack({
      title: 'T',
      artist: 'A',
      youtubeUrl: 'https://youtube.com/x',
    });

    const tracks = useLikedTracksStore.getState().tracks;
    expect(tracks).toHaveLength(1);
    expect(tracks[0]?.id).toBe('t1');
    expect(tracks[0]?.title).toBe('T');
  });

  it('rolls back optimistic unlike on server error', async () => {
    useLikedTracksStore.setState({
      tracks: [
        {
          id: 'existing-1',
          userId: 'u1',
          title: 'Persist',
          artist: 'P',
          album: null,
          artworkUrl: null,
          youtubeUrl: 'https://y/x',
          isrc: null,
          songlinkUrl: null,
          platformLinks: null,
          artistId: null,
          createdAt: '2026-01-01T00:00:00Z',
        },
      ],
    });

    server.use(
      http.delete(
        'http://localhost:3000/api/track/like/existing-1',
        () => new HttpResponse(null, { status: 500 })
      )
    );

    await useLikedTracksStore.getState().unlikeTrack('existing-1');

    const tracks = useLikedTracksStore.getState().tracks;
    expect(tracks).toHaveLength(1);
    expect(tracks[0]?.id).toBe('existing-1');
    expect(useLikedTracksStore.getState().error).not.toBeNull();
  });

  it('isTrackLiked helper matches case-insensitively', () => {
    const tracks = [
      {
        id: 'x',
        userId: 'u1',
        title: 'Hello World',
        artist: 'Artist Name',
        album: null,
        artworkUrl: null,
        youtubeUrl: 'https://y/x',
        isrc: null,
        songlinkUrl: null,
        platformLinks: null,
        artistId: null,
        createdAt: '2026-01-01T00:00:00Z',
      },
    ];

    expect(isTrackLiked(tracks, 'hello world', 'artist name')).toBe(true);
    expect(isTrackLiked(tracks, 'HELLO WORLD', 'ARTIST NAME')).toBe(true);
    expect(isTrackLiked(tracks, 'Other', 'Other')).toBe(false);
  });

  it('isTrackLiked does not collide on adjacent-substring titles/artists', () => {
    // Without a separator, ("Hellow", "orld") and ("Hello", "World") would
    // both produce the key "helloworld" and incorrectly match each other.
    const tracks = [
      {
        id: 'x',
        userId: 'u1',
        title: 'Hellow',
        artist: 'orld',
        album: null,
        artworkUrl: null,
        youtubeUrl: 'https://y/x',
        isrc: null,
        songlinkUrl: null,
        platformLinks: null,
        artistId: null,
        createdAt: '2026-01-01T00:00:00Z',
      },
    ];

    expect(isTrackLiked(tracks, 'Hello', 'World')).toBe(false);
    expect(isTrackLiked(tracks, 'Hellow', 'orld')).toBe(true);
  });

  it('clear() wipes tracks and error', () => {
    useLikedTracksStore.setState({
      tracks: [
        {
          id: 'x',
          userId: 'u1',
          title: 'T',
          artist: 'A',
          album: null,
          artworkUrl: null,
          youtubeUrl: 'https://y/x',
          isrc: null,
          songlinkUrl: null,
          platformLinks: null,
          artistId: null,
          createdAt: '2026-01-01T00:00:00Z',
        },
      ],
      error: 'previous error',
    });

    useLikedTracksStore.getState().clear();

    expect(useLikedTracksStore.getState().tracks).toHaveLength(0);
    expect(useLikedTracksStore.getState().error).toBeNull();
  });
});
