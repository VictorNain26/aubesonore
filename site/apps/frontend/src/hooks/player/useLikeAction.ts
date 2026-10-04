import { useCallback } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { useLikedTracksStore } from '../../stores/likedTracksStore';
import { useAuthStore } from '../../stores/authStore';
import { useOpenSignIn } from '../../lib/signIn';
import { artistPath, resolveArtistPage } from '../../lib/artistProfile';
import { keepRequest, savePendingKeep } from '../../lib/pendingKeep';
import * as m from '@/paraglide/messages.js';

// Encapsulates the like / unlike flow used by both TrackArtwork (current
// track) and RecentTracks (previously played). Guards against:
// - unauthenticated users (opens the shared auth modal)
// - double-click on the same track (likingTrackId lock — lives in the
//   store so concurrent instances of this hook share the same lock)
// - duplicate row in the liked list (lookup by case-insensitive title+artist)

interface UseLikeAction {
  likingTrackId: string | null;
  toggleLike: (title: string, artist: string, artworkUrl?: string) => Promise<void>;
}

export function useLikeAction(): UseLikeAction {
  const likeTrack = useLikedTracksStore((s) => s.likeTrack);
  const unlikeTrack = useLikedTracksStore((s) => s.unlikeTrack);
  const tracks = useLikedTracksStore((s) => s.tracks);
  const likingTrackId = useLikedTracksStore((s) => s.likingTrackId);
  const setLikingTrackId = useLikedTracksStore((s) => s.setLikingTrackId);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const openSignIn = useOpenSignIn();
  const navigate = useNavigate();

  const toggleLike = useCallback(
    async (title: string, artist: string, artworkUrl?: string): Promise<void> => {
      if (!isAuthenticated) {
        savePendingKeep(keepRequest(title, artist, artworkUrl));
        openSignIn({ keepTitle: title });
        return;
      }

      const trackKey = `${title}-${artist}`;
      // Read the latest value from the store (not the subscribed selector)
      // so back-to-back synchronous calls see the lock set by the first.
      if (useLikedTracksStore.getState().likingTrackId === trackKey) return;

      setLikingTrackId(trackKey);
      try {
        const existingTrack = tracks.find(
          (t) =>
            t.title.toLowerCase() === title.toLowerCase() &&
            t.artist.toLowerCase() === artist.toLowerCase()
        );

        if (existingTrack) {
          const success = await unlikeTrack(existingTrack.id);
          if (success) {
            toast.success(m.toast_unkept());
          }
        } else {
          await likeTrack(keepRequest(title, artist, artworkUrl));
          const page = await resolveArtistPage(artist).catch(() => null);
          if (page) {
            toast.success(m.toast_kept(), {
              action: {
                label: m.toast_discover_artist({ artist }),
                onClick: () => void navigate(artistPath(page)),
              },
            });
          } else {
            toast.success(m.toast_kept());
          }
        }
      } finally {
        setLikingTrackId(null);
      }
    },
    [likeTrack, unlikeTrack, tracks, isAuthenticated, openSignIn, setLikingTrackId, navigate]
  );

  return { likingTrackId, toggleLike };
}
