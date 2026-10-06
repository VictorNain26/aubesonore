import { useEffect, useMemo, useState } from 'react';
import { Navigate, useLocation, useParams } from 'react-router';
import { ArtistPageView, type ArtistPageState } from '../artist/ArtistPageView';
import { useHeroListenVisible } from '../home/listen';
import { SiteFooter } from '../home/SiteFooter';
import type { MusilogyArtist } from '@aubesonore/shared-types/client';
import { artistPath, fetchArtistProfile } from '../lib/artistProfile';
import { profileKey, seenMusilogy, seenProfiles } from '../lib/artistPageData';
import { useDiscoveryTrail } from '../lib/discoveryTrail';
import { fetchMusilogyArtist } from '../lib/musilogy';
import { useScrollMemory } from '../lib/scrollMemory';
import { useAuthStore } from '../stores/authStore';
import * as m from '@/paraglide/messages.js';
import { useLikedTracksStore } from '../stores/likedTracksStore';
import { useLocale } from '../stores/localeStore';

export default function ArtistPage() {
  const { slug } = useParams<{ slug: string }>();
  const locale = useLocale();
  const [loaded, setLoaded] = useState<{
    key: string;
    state: ArtistPageState;
  } | null>(null);
  const key = profileKey(slug ?? '', locale);
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

  useEffect(() => {
    if (!slug) return;
    const controller = new AbortController();
    fetchArtistProfile(slug, controller.signal)
      .then((profile) => {
        const next: ArtistPageState = profile
          ? { status: 'ready', profile }
          : { status: 'missing' };
        seenProfiles.set(key, next);
        setLoaded({ key, state: next });
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === 'AbortError') return;
        // A page already drawn (rendered by the server, or seen in this tab) stays as it is.
        if (seenProfiles.get(key)) return;
        setLoaded({ key, state: { status: 'error' } });
      });
    return () => controller.abort();
  }, [slug, key]);

  // Derived, so another artist or language never flashes the previous one.
  const state: ArtistPageState =
    loaded !== null && loaded.key === key
      ? loaded.state
      : (seenProfiles.get(key) ?? { status: 'loading' });

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

  // What Musilogy holds of the artist, once the profile gives their MBID. A failure or Musilogy not
  // loaded leaves the page without those sections; the profile still answers.
  const mbid = state.status === 'ready' ? state.profile.mbid : null;
  const [musilogy, setMusilogy] = useState<{ mbid: string; artist: MusilogyArtist | null } | null>(
    null
  );
  useEffect(() => {
    if (!mbid) return;
    const controller = new AbortController();
    const settle = (artist: MusilogyArtist | null) => {
      seenMusilogy.set(mbid, artist);
      setMusilogy({ mbid, artist });
    };
    fetchMusilogyArtist(mbid, controller.signal)
      .then(settle)
      .catch((err: unknown) => {
        if (!(err instanceof Error && err.name === 'AbortError')) settle(null);
      });
    return () => controller.abort();
  }, [mbid]);
  const musilogySeen = mbid ? seenMusilogy.get(mbid) : undefined;
  const musilogyArtist =
    musilogy !== null && musilogy.mbid === mbid ? musilogy.artist : (musilogySeen ?? null);

  // Ready once Musilogy has answered too: back restores the place in its lists.
  const settled = state.status !== 'loading' && (!mbid || musilogySeen !== undefined);
  useScrollMemory(settled);

  // A played artist reached at its MBID has one address, its slug.
  const location = useLocation();
  const elsewhere = state.status === 'ready' && state.profile.slug !== slug;
  const trail = useDiscoveryTrail(
    state.status === 'ready' && !elsewhere
      ? { path: location.pathname, name: state.profile.name }
      : null
  );

  useEffect(() => {
    const previous = document.title;
    return () => {
      document.title = previous;
    };
  }, []);

  // An unknown artist's tab says so, like the 404's.
  const name =
    state.status === 'ready'
      ? state.profile.name
      : state.status === 'missing'
        ? m.notfound_meta_title()
        : null;
  useEffect(() => {
    if (name) document.title = `${name} · AubeSonore`;
  }, [name]);

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
      <ArtistPageView state={state} kept={kept} musilogy={musilogyArtist} trail={trail} />
      {/* Once the page has its content: shown while it loads, the footer sat in view and was
          pushed down by the profile, then by Musilogy's sections (a CLS of 0.29). */}
      {settled ? <SiteFooter /> : null}
    </div>
  );
}
