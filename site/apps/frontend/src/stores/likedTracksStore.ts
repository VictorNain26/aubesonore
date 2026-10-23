import { create } from 'zustand';
import { HttpError, trackApi, type LikedTrack, type LikeTrackRequest } from '../lib/api';

// Liked-tracks state. Consumers subscribe to slices granularly via
// Zustand selectors. Auth-driven refresh/clear is wired by <AuthInit />
// — the store itself stays auth-agnostic.

interface LikedTracksState {
  tracks: LikedTrack[];
  isLoading: boolean;
  error: string | null;
  // Cross-component lock for an in-flight keep/unkeep. Lives here (not in useLikeAction) so two
  // places showing the same track (the hero and the day's list) see the same value.
  likingTrackId: string | null;
}

/** How a keep or an unkeep ended: done, refused for want of a session (401), or failed. */
export type KeepOutcome = 'done' | 'signed-out' | 'failed';

function failureOf(err: unknown): KeepOutcome {
  return err instanceof HttpError && err.status === 401 ? 'signed-out' : 'failed';
}

interface LikedTracksActions {
  refresh: () => Promise<void>;
  clear: () => void;
  likeTrack: (data: LikeTrackRequest) => Promise<KeepOutcome>;
  unlikeTrack: (trackId: string) => Promise<KeepOutcome>;
  setLikingTrackId: (id: string | null) => void;
}

// Pure helper: callers subscribe to `tracks` themselves so a like/unlike
// triggers a re-render. Exposing this as an action on the store would
// return a stable function reference and silently miss those re-renders.
// NUL byte separator: never appears in user-entered text, so the composed
// key is collision-free for adjacent-substring titles ("Hellow"+"orld"
// vs "Hello"+"World").
const LIKED_KEY_SEP = String.fromCharCode(0);

/** One key per track whatever its case: the lock on a keep in flight, the lookup of a kept one. */
export function trackKey(title: string, artist: string): string {
  return `${title.toLowerCase()}${LIKED_KEY_SEP}${artist.toLowerCase()}`;
}

/** The kept row of this track, its case aside. */
export function findKept(
  tracks: readonly LikedTrack[],
  title: string,
  artist: string
): LikedTrack | undefined {
  const needle = trackKey(title, artist);
  return tracks.find((t) => trackKey(t.title, t.artist) === needle);
}

export function isTrackLiked(
  tracks: readonly LikedTrack[],
  title: string,
  artist: string
): boolean {
  return findKept(tracks, title, artist) !== undefined;
}

type LikedTracksStore = LikedTracksState & LikedTracksActions;

let refreshing: Promise<void> | null = null;

export const useLikedTracksStore = create<LikedTracksStore>((set, get) => ({
  tracks: [],
  isLoading: false,
  error: null,
  likingTrackId: null,

  setLikingTrackId: (id) => set({ likingTrackId: id }),

  // A sign-in asks from AuthInit and from the page shown at once: a refresh made while one is in
  // flight waits for that one rather than asking the library again.
  refresh: () => {
    refreshing ??= (async () => {
      set({ isLoading: true, error: null });
      try {
        const data = await trackApi.getLikedTracks();
        set({ tracks: data, isLoading: false });
      } catch (err) {
        set({
          isLoading: false,
          error: err instanceof Error ? err.message : 'Erreur de chargement',
        });
      } finally {
        refreshing = null;
      }
    })();
    return refreshing;
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
      artistId: null,
      createdAt: new Date().toISOString(),
    };

    set((state) => ({ tracks: [...state.tracks, optimisticTrack] }));

    try {
      const result = await trackApi.likeTrack(data);
      set((state) => ({
        tracks: state.tracks.map((t) => (t.id === tempId ? result.track : t)),
      }));
      return 'done';
    } catch (err) {
      set((state) => ({
        tracks: state.tracks.filter((t) => t.id !== tempId),
        error: err instanceof Error ? err.message : 'Erreur lors du like',
      }));
      return failureOf(err);
    }
  },

  unlikeTrack: async (trackId) => {
    const current = get().tracks;
    const previousIndex = current.findIndex((t) => t.id === trackId);
    const trackToRemove = previousIndex >= 0 ? current[previousIndex] : undefined;
    if (!trackToRemove) return 'failed';

    set((state) => ({ tracks: state.tracks.filter((t) => t.id !== trackId) }));

    try {
      await trackApi.unlikeTrack(trackId);
      return 'done';
    } catch (err) {
      set((state) => {
        const newTracks = [...state.tracks];
        newTracks.splice(previousIndex, 0, trackToRemove);
        return {
          tracks: newTracks,
          error: err instanceof Error ? err.message : 'Erreur lors de la suppression',
        };
      });
      return failureOf(err);
    }
  },
}));
