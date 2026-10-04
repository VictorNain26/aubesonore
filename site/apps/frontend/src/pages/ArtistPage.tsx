import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router';
import { ArtistPageView, type ArtistPageState } from '../artist/ArtistPageView';
import { useHeroListenVisible } from '../home/listen';
import { SiteFooter } from '../home/SiteFooter';
import type { MusilogyArtist } from '@aubesonore/shared-types/client';
import { fetchArtistProfile } from '../lib/artistProfile';
import { fetchMusilogyArtist } from '../lib/musilogy';
import { useAuthStore } from '../stores/authStore';
import { useLikedTracksStore } from '../stores/likedTracksStore';
import { useLocaleStore } from '../stores/localeStore';

export default function ArtistPage() {
  const { id } = useParams<{ id: string }>();
  const locale = useLocaleStore((s) => s.locale);
  const [loaded, setLoaded] = useState<{
    key: string;
    state: ArtistPageState;
  } | null>(null);
  const key = `${id}:${locale}`;
  const setListenVisible = useHeroListenVisible((s) => s.setVisible);
  // The listener's kept tracks: this artist's, newest first. Loaded again on
  // each page, since a track kept a moment ago is tied to its artist after the
  // like answered.
  const tracks = useLikedTracksStore((s) => s.tracks);
  const signedIn = useAuthStore((s) => s.isAuthenticated);
  useEffect(() => {
    if (signedIn) void useLikedTracksStore.getState().refresh();
  }, [id, signedIn]);
  const kept = useMemo(
    () =>
      tracks
        .filter((track) => track.artistId === id)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [tracks, id]
  );

  // No hero here: the player bar is the only way to listen.
  useEffect(() => setListenVisible(false), [setListenVisible]);

  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    fetchArtistProfile(id, controller.signal)
      .then((profile) =>
        setLoaded({
          key,
          state: profile ? { status: 'ready', profile } : { status: 'missing' },
        })
      )
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === 'AbortError') return;
        setLoaded({ key, state: { status: 'error' } });
      });
    return () => controller.abort();
  }, [id, key]);

  // Derived, so another artist or language never flashes the previous one.
  const state: ArtistPageState =
    loaded !== null && loaded.key === key ? loaded.state : { status: 'loading' };

  // What Musilogy holds of the artist, once the profile gives their MBID. A failure or Musilogy not
  // loaded leaves the page without those sections; the profile still answers.
  const mbid = state.status === 'ready' ? state.profile.mbid : null;
  const [musilogy, setMusilogy] = useState<{ mbid: string; artist: MusilogyArtist } | null>(null);
  useEffect(() => {
    if (!mbid) return;
    const controller = new AbortController();
    fetchMusilogyArtist(mbid, controller.signal)
      .then((artist) => {
        if (artist) setMusilogy({ mbid, artist });
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [mbid]);

  useEffect(() => {
    const previous = document.title;
    return () => {
      document.title = previous;
    };
  }, []);

  const name = state.status === 'ready' ? state.profile.name : null;
  useEffect(() => {
    if (name) document.title = `${name} · AubeSonore`;
  }, [name]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [id]);

  return (
    <>
      <ArtistPageView
        state={state}
        kept={kept}
        musilogy={musilogy !== null && musilogy.mbid === mbid ? musilogy.artist : null}
      />
      <SiteFooter />
    </>
  );
}
