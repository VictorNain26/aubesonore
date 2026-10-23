import { useCallback } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { findKept, trackKey, useLikedTracksStore } from '../stores/likedTracksStore';
import { useAuthStore } from '../stores/authStore';
import { useOpenSignIn } from '../lib/signIn';
import { artistPath, resolveArtistPage } from '../lib/artistProfile';
import { keepRequest, savePendingKeep } from '../lib/pendingKeep';
import { toastError } from '../lib/appToast';
import * as m from '@/paraglide/messages.js';

// The keep / unkeep flow of every track the site shows. Guards against:
// - a listener not signed in, or whose session the server no longer knows (keeps the track for
//   after sign-in, opens the sign-in page)
// - a failed request (the heart goes back, the listener is told; never a « Gardé. » for nothing)
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
  const sessionEnded = useAuthStore((s) => s.sessionEnded);
  const openSignIn = useOpenSignIn();
  const navigate = useNavigate();

  const toggleLike = useCallback(
    async (title: string, artist: string, artworkUrl?: string): Promise<void> => {
      const request = keepRequest(title, artist, artworkUrl);
      if (!isAuthenticated) {
        savePendingKeep(request);
        openSignIn({ keepTitle: title });
        return;
      }

      const key = trackKey(title, artist);
      // Read the latest value from the store (not the subscribed selector)
      // so back-to-back synchronous calls see the lock set by the first.
      if (useLikedTracksStore.getState().likingTrackId === key) return;

      setLikingTrackId(key);
      try {
        const existingTrack = findKept(tracks, title, artist);

        if (existingTrack) {
          const outcome = await unlikeTrack(existingTrack.id);
          if (outcome === 'done') {
            toast.success(m.toast_unkept());
          } else if (outcome === 'signed-out') {
            sessionEnded();
            openSignIn();
          } else {
            toastError(m.library_remove_failed());
          }
          return;
        }

        const outcome = await likeTrack(request);
        if (outcome === 'signed-out') {
          // The session ended on the server: the same way as a listener not signed in.
          sessionEnded();
          savePendingKeep(request);
          openSignIn({ keepTitle: title });
          return;
        }
        if (outcome === 'failed') {
          toastError(m.track_keep_failed());
          return;
        }
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
      } finally {
        setLikingTrackId(null);
      }
    },
    [
      likeTrack,
      unlikeTrack,
      tracks,
      isAuthenticated,
      sessionEnded,
      openSignIn,
      setLikingTrackId,
      navigate,
    ]
  );

  return { likingTrackId, toggleLike };
}
