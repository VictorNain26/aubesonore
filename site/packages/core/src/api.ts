import type { ClientLikedTrack, LikeTrackRequest } from '@aubesonore/shared-types/client';

export interface ApiClient {
  fetch: <T>(endpoint: string, options?: RequestInit) => Promise<T>;
}

export function createTrackApi(client: ApiClient): {
  getLikedTracks: () => Promise<ClientLikedTrack[]>;
  likeTrack: (data: LikeTrackRequest) => Promise<{ message: string; track: ClientLikedTrack }>;
  unlikeTrack: (trackId: string) => Promise<{ message: string; track: ClientLikedTrack }>;
} {
  return {
    getLikedTracks: (): Promise<ClientLikedTrack[]> => client.fetch('/api/track/like'),

    likeTrack: (data: LikeTrackRequest): Promise<{ message: string; track: ClientLikedTrack }> =>
      client.fetch('/api/track/like', {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    unlikeTrack: (trackId: string): Promise<{ message: string; track: ClientLikedTrack }> =>
      // keepalive: a removal sent as the page closes still reaches the server.
      client.fetch(`/api/track/like/${trackId}`, {
        method: 'DELETE',
        keepalive: true,
      }),
  };
}
