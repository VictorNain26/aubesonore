import { useEffect, useMemo, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router';
import { getLocale } from '@/paraglide/runtime.js';
import * as m from '@/paraglide/messages.js';
import { useHeroListenVisible } from '../home/listen';
import { SiteFooter } from '../home/SiteFooter';
import { orderKept, type KeptOrder } from '../library/order';
import { MyTracksView, type MyTracksState } from '../library/MyTracksView';
import { removeKeptTrack, useRemovingTracks } from '../library/removal';
import { useAuthStore } from '../stores/authStore';
import { useLikedTracksStore } from '../stores/likedTracksStore';

export function MyTracksPage() {
  const { pathname } = useLocation();
  // In the address, so a reload or a shared link keeps the order.
  const [params, setParams] = useSearchParams();
  const order: KeptOrder = params.get('sort') === 'artist' ? 'artist' : 'date';
  const signedIn = useAuthStore((s) => s.isAuthenticated);
  const authLoading = useAuthStore((s) => s.isLoading);
  const tracks = useLikedTracksStore((s) => s.tracks);
  const failed = useLikedTracksStore((s) => s.error !== null && !s.isLoading);
  const removing = useRemovingTracks((s) => s.ids);
  // The store is filled at sign-in; this page asks again for the artist pages of tracks tied
  // since, and shows the store's tracks meanwhile.
  const [settled, setSettled] = useState(false);
  const setListenVisible = useHeroListenVisible((s) => s.setVisible);

  useEffect(() => {
    if (!signedIn) return;
    void useLikedTracksStore
      .getState()
      .refresh()
      .finally(() => setSettled(true));
  }, [signedIn]);

  // No hero here: the player bar is the only way to listen.
  useEffect(() => setListenVisible(false), [setListenVisible]);

  useEffect(() => {
    const previous = document.title;
    document.title = `${m.library_title()} · AubeSonore`;
    window.scrollTo(0, 0);
    return () => {
      document.title = previous;
    };
  }, []);

  const shown = useMemo(
    () => orderKept(tracks, order, getLocale()).filter((t) => !removing.has(t.id)),
    [tracks, order, removing]
  );

  const state: MyTracksState =
    !authLoading && !signedIn
      ? { status: 'signed-out', signInHref: m.signin_href(), from: pathname }
      : tracks.length > 0
        ? { status: 'ready', tracks: shown }
        : authLoading || !settled
          ? { status: 'loading' }
          : failed
            ? { status: 'error', onRetry: () => void useLikedTracksStore.getState().refresh() }
            : { status: 'ready', tracks: [] };

  return (
    <>
      <MyTracksView
        state={state}
        order={order}
        onOrderChange={(next) =>
          setParams(next === 'artist' ? { sort: 'artist' } : {}, { replace: true })
        }
        onRemove={removeKeptTrack}
      />
      <SiteFooter />
    </>
  );
}
