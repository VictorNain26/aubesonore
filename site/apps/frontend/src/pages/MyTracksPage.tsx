import { useEffect, useMemo, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router';
import { getLocale } from '@/paraglide/runtime.js';
import * as m from '@/paraglide/messages.js';
import { useHeroListenVisible } from '../home/listen';
import { SiteFooter } from '../home/SiteFooter';
import { SiteHeader } from '../home/SiteHeader';
import {
  DEFAULT_SORT,
  filterKept,
  firstDir,
  sortKept,
  type KeptSort,
  type SortKey,
} from '../library/order';
import { MyTracksView, type MyTracksState } from '../library/MyTracksView';
import { removeKeptTrack, useRemovingTracks } from '../library/removal';
import { useAuthStore } from '../stores/authStore';
import { useLikedTracksStore } from '../stores/likedTracksStore';

const SORT_KEYS: readonly SortKey[] = ['added', 'title', 'artist'];

/** `?sort=artist` (A to Z), `?sort=title&dir=desc`…; the newest first when the address says nothing. */
function sortOf(params: URLSearchParams): KeptSort {
  const key = SORT_KEYS.find((k) => k === params.get('sort'));
  if (!key) return DEFAULT_SORT;
  const dir = params.get('dir');
  return { key, dir: dir === 'asc' || dir === 'desc' ? dir : firstDir(key) };
}

function paramsOf(sort: KeptSort): Record<string, string> {
  if (sort.key === DEFAULT_SORT.key && sort.dir === DEFAULT_SORT.dir) return {};
  return sort.dir === firstDir(sort.key) ? { sort: sort.key } : { sort: sort.key, dir: sort.dir };
}

export function MyTracksPage() {
  const { pathname } = useLocation();
  // In the address, so a reload or a shared link keeps the order.
  const [params, setParams] = useSearchParams();
  const { key: sortKey, dir: sortDir } = sortOf(params);
  const signedIn = useAuthStore((s) => s.isAuthenticated);
  const authLoading = useAuthStore((s) => s.isLoading);
  const tracks = useLikedTracksStore((s) => s.tracks);
  const failed = useLikedTracksStore((s) => s.error !== null && !s.isLoading);
  const removing = useRemovingTracks((s) => s.ids);
  const [query, setQuery] = useState('');
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

  const kept = useMemo(
    () =>
      sortKept(tracks, { key: sortKey, dir: sortDir }, getLocale()).filter(
        (t) => !removing.has(t.id)
      ),
    [tracks, sortKey, sortDir, removing]
  );
  const shown = useMemo(() => filterKept(kept, query, getLocale()), [kept, query]);

  const state: MyTracksState =
    !authLoading && !signedIn
      ? { status: 'signed-out', signInHref: m.signin_href(), from: pathname }
      : tracks.length > 0
        ? { status: 'ready', tracks: shown, total: kept.length }
        : authLoading || !settled
          ? { status: 'loading' }
          : failed
            ? { status: 'error', onRetry: () => void useLikedTracksStore.getState().refresh() }
            : { status: 'ready', tracks: [], total: 0 };

  return (
    <div className="min-h-page flex flex-col">
      <SiteHeader />
      <MyTracksView
        state={state}
        sort={{ key: sortKey, dir: sortDir }}
        onSortChange={(next) => setParams(paramsOf(next), { replace: true })}
        query={query}
        onQueryChange={setQuery}
        onRemove={removeKeptTrack}
      />
      <SiteFooter />
    </div>
  );
}
