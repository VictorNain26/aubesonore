import { create } from 'zustand';
import { trackApi, type LikedTrack, type LikeTrackRequest } from '../lib/api';

// Liked-tracks state. Consumers subscribe to slices granularly via
// Zustand selectors. Auth-driven refresh/clear is wired by <AuthInit />
// — the store itself stays auth-agnostic.

interface LikedTracksState {
  tracks: LikedTrack[];
  isLoading: boolean;
  error: string | null;
  // Cross-component lock for in-flight like/unlike. Lives here (not in
  // useLikeAction) so simultaneous clicks from TrackArtwork + RecentTracks
  // on the same track see the same value and can short-circuit.
  likingTrackId: string | null;
}

interface LikedTracksActions {
  refresh: () => Promise<void>;
  clear: () => void;
  likeTrack: (data: LikeTrackRequest) => Promise<LikedTrack | null>;
  unlikeTrack: (trackId: string) => Promise<boolean>;
  setLikingTrackId: (id: string | null) => void;
}

// Pure helper: callers subscribe to `tracks` themselves so a like/unlike
// triggers a re-render. Exposing this as an action on the store would
// return a stable function reference and silently miss those re-renders.
// NUL byte separator: never appears in user-entered text, so the composed
// key is collision-free for adjacent-substring titles ("Hellow"+"orld"
// vs "Hello"+"World").
const LIKED_KEY_SEP = String.fromCharCode(0);

export function isTrackLiked(
  tracks: readonly LikedTrack[],
  title: string,
  artist: string
): boolean {
  const needle = `${title.toLowerCase()}${LIKED_KEY_SEP}${artist.toLowerCase()}`;
  return tracks.some(
    (t) => `${t.title.toLowerCase()}${LIKED_KEY_SEP}${t.artist.toLowerCase()}` === needle
  );
}

type LikedTracksStore = LikedTracksState & LikedTracksActions;

export const useLikedTracksStore = create<LikedTracksStore>((set, get) => ({
  tracks: [],
  isLoading: false,
  error: null,
  likingTrackId: null,

  setLikingTrackId: (id) => set({ likingTrackId: id }),

  refresh: async () => {
    set({ isLoading: true, error: null });
    try {
      const data = await trackApi.getLikedTracks();
      set({ tracks: data, isLoading: false });
    } catch (err) {
      set({
        isLoading: false,
        error: err instanceof Error ? err.message : 'Erreur de chargement',
      });
    }
  },

  clear: () => {
    set({ tracks: [], error: null });
  },

  likeTrack: async (data) => {
    const tempId = `temp-${crypto.randomUUID()}`;
    const optimisticTrack: LikedTrack = {
      id: tempId,
      userId: '',
      title: data.title,
      artist: data.artist,
      album: null,
      artworkUrl: data.artworkUrl || null,
      youtubeUrl: data.youtubeUrl,
      isrc: null,
      songlinkUrl: null,
      platformLinks: null,
      artistId: null,
      createdAt: new Date().toISOString(),
    };

    set((state) => ({ tracks: [...state.tracks, optimisticTrack] }));

    try {
      const result = await trackApi.likeTrack(data);
      set((state) => ({
        tracks: state.tracks.map((t) => (t.id === tempId ? result.track : t)),
      }));
      return result.track;
    } catch (err) {
      set((state) => ({
        tracks: state.tracks.filter((t) => t.id !== tempId),
        error: err instanceof Error ? err.message : 'Erreur lors du like',
      }));
      return null;
    }
  },

  unlikeTrack: async (trackId) => {
    const current = get().tracks;
    const previousIndex = current.findIndex((t) => t.id === trackId);
    const trackToRemove = previousIndex >= 0 ? current[previousIndex] : undefined;
    if (!trackToRemove) return false;

    set((state) => ({ tracks: state.tracks.filter((t) => t.id !== trackId) }));

    try {
      await trackApi.unlikeTrack(trackId);
      return true;
    } catch (err) {
      set((state) => {
        const newTracks = [...state.tracks];
        newTracks.splice(previousIndex, 0, trackToRemove);
        return {
          tracks: newTracks,
          error: err instanceof Error ? err.message : 'Erreur lors de la suppression',
        };
      });
      return false;
    }
  },
}));
