import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router';
import * as m from '@/paraglide/messages.js';
import { useHeroListenVisible } from '../home/listen';
import { SiteFooter } from '../home/SiteFooter';
import { groupByArtist } from '../library/groups';
import { MyTracksView, type MyTracksState } from '../library/MyTracksView';
import { removeKeptTrack, useRemovingTracks } from '../library/removal';
import { useAuthStore } from '../stores/authStore';
import { useLikedTracksStore } from '../stores/likedTracksStore';

export function MyTracksPage() {
  const { pathname } = useLocation();
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

  // Grouped before hiding, so a removal waiting for its Annuler does not move the artists.
  const groups = useMemo(
    () =>
      groupByArtist(tracks)
        .map((group) => ({ ...group, tracks: group.tracks.filter((t) => !removing.has(t.id)) }))
        .filter((group) => group.tracks.length > 0),
    [tracks, removing]
  );
  const count = tracks.length - tracks.filter((t) => removing.has(t.id)).length;

  const state: MyTracksState =
    !authLoading && !signedIn
      ? { status: 'signed-out', signInHref: m.signin_href(), from: pathname }
      : tracks.length > 0
        ? { status: 'ready', groups, count }
        : authLoading || !settled
          ? { status: 'loading' }
          : failed
            ? { status: 'error', onRetry: () => void useLikedTracksStore.getState().refresh() }
            : { status: 'ready', groups, count: 0 };

  return (
    <>
      <MyTracksView state={state} onRemove={removeKeptTrack} />
      <SiteFooter />
    </>
  );
}
