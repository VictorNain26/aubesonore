import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { ArtistPageView, type ArtistPageState } from '../artist/ArtistPageView';
import { useHeroListenVisible } from '../home/listen';
import { SiteFooter } from '../home/SiteFooter';
import { fetchArtistProfile } from '../lib/artistProfile';
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

  useEffect(() => {
    const previous = document.title;
    return () => {
      document.title = previous;
    };
  }, []);

  const name = state.status === 'ready' ? state.profile.name : null;
  useEffect(() => {
    if (name) document.title = `${name} — AubeSonore`;
  }, [name]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [id]);

  return (
    <>
      <ArtistPageView state={state} />
      <SiteFooter />
    </>
  );
}
