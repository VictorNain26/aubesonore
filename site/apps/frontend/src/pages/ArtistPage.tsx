import { useEffect, useMemo } from 'react';
import { usePageTitle } from '../hooks/usePageTitle';
import { Navigate, useLoaderData, useLocation, useParams } from 'react-router';
import { ArtistPageView } from '../artist/ArtistPageView';
import { useHeroListenVisible } from '../home/listen';
import { SiteFooter } from '../shell/SiteFooter';
import { artistPath } from '../lib/artistProfile';
import type { artistLoader } from '../lib/artistPageData';
import { useDiscoveryTrail } from '../lib/discoveryTrail';
import { useAuthStore } from '../stores/authStore';
import * as m from '@/paraglide/messages.js';
import { getLocale } from '@/paraglide/runtime.js';
import { artistPageName } from '@aubesonore/shared-types/artist-page';
import { useLikedTracksStore } from '../stores/likedTracksStore';

/** An artist page, drawn from what its loader brought (lib/artistPageData.ts, routes.tsx). */
export function ArtistPage() {
  const { slug } = useParams<{ slug: string }>();
  const { state, musilogy } = useLoaderData<typeof artistLoader>();
  const setListenVisible = useHeroListenVisible((s) => s.setVisible);
  // The listener's kept tracks: this artist's, newest first. Loaded again on
  // each page, since a track kept a moment ago is tied to its artist after the
  // like answered.
  const tracks = useLikedTracksStore((s) => s.tracks);
  const signedIn = useAuthStore((s) => s.isAuthenticated);
  useEffect(() => {
    if (signedIn) void useLikedTracksStore.getState().refresh();
  }, [slug, signedIn]);

  // No hero here: the player bar is the only way to listen.
  useEffect(() => setListenVisible(false), [setListenVisible]);

  // Kept tracks are tied to the artist's id, which the profile gives.
  const id = state.status === 'ready' ? state.profile.id : null;
  const kept = useMemo(
    () =>
      id === null
        ? []
        : tracks
            .filter((track) => track.artistId === id)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [tracks, id]
  );

  // A played artist reached at its MBID has one address, its slug.
  const location = useLocation();
  const elsewhere = state.status === 'ready' && state.profile.slug !== slug;
  const trail = useDiscoveryTrail(
    state.status === 'ready' && !elsewhere
      ? { path: location.pathname, name: state.profile.name }
      : null
  );

  // The tab says what the server's <title> says (artistPageName), which search engines keep once
  // they ran the page; an unknown artist's says so, like the 404's.
  const name =
    state.status === 'ready'
      ? artistPageName(state.profile, musilogy, getLocale())
      : state.status === 'missing'
        ? m.notfound_meta_title()
        : null;
  usePageTitle(name);

  if (elsewhere) {
    return (
      <Navigate
        to={artistPath(state.profile)}
        replace
        state={location.state as { discovery?: boolean } | null}
      />
    );
  }

  return (
    <div className="min-h-page flex flex-col">
      <ArtistPageView state={state} kept={kept} musilogy={musilogy} trail={trail} />
      <SiteFooter />
    </div>
  );
}
