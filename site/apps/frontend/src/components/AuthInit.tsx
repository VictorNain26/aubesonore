import { useEffect } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useLikedTracksStore } from '../stores/likedTracksStore';
import { isTrackLiked } from '../stores/likedTracksStore';
import { takePendingKeep } from '../lib/pendingKeep';
import { toast } from 'sonner';
import * as m from '@/paraglide/messages.js';

// Invisible side-effect host that hydrates the auth session once and
// bridges auth transitions to the liked-tracks store. Replaces the previous AuthProvider mount + AuthDataSync
// pairing — same observable behavior, one mounted component instead of
// two and zero React Context.

/** Keeps the track the listener tapped before signing in, once the library is loaded. */
async function keepPendingTrack(): Promise<void> {
  const request = takePendingKeep();
  if (!request) return;
  await useLikedTracksStore.getState().refresh();
  const { tracks, likeTrack } = useLikedTracksStore.getState();
  if (isTrackLiked(tracks, request.title, request.artist)) return;
  if (await likeTrack(request)) toast.success(m.toast_kept());
}

export function AuthInit(): null {
  useEffect(() => {
    let cancelled = false;

    // Hydrate session once. After init resolves, fire the initial sync
    // pass: signed-in users get their liked tracks fetched
    // before the first interactive frame.
    void (async () => {
      await useAuthStore.getState().init();
      if (cancelled) return;
      if (useAuthStore.getState().isAuthenticated) {
        void keepPendingTrack().then(() => useLikedTracksStore.getState().refresh());
      }
    })();

    // Subscribe to subsequent transitions (sign-in / sign-out after init).
    // Skip the loading-state window so we don't double-fire alongside the
    // explicit post-init sync above.
    const unsubscribe = useAuthStore.subscribe((state, prevState) => {
      if (state.isLoading || prevState.isLoading) return;
      if (state.isAuthenticated === prevState.isAuthenticated) return;
      if (state.isAuthenticated) {
        void keepPendingTrack().then(() => useLikedTracksStore.getState().refresh());
      } else {
        useLikedTracksStore.getState().clear();
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return null;
}
