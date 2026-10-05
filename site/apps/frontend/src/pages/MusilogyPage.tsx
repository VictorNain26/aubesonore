import { useEffect, useState } from 'react';
import { Navigate, useLocation, useParams } from 'react-router';
import * as m from '@/paraglide/messages.js';
import { useHeroListenVisible } from '../home/listen';
import { SiteFooter } from '../home/SiteFooter';
import { fetchMusilogyArtist, MusilogyUnavailableError, searchMusilogy } from '../lib/musilogy';
import { artistPath } from '../lib/artistProfile';
import { useDiscoveryTrail } from '../lib/discoveryTrail';
import { useScrollMemory } from '../lib/scrollMemory';
import { seenStore } from '../lib/seenPages';
import {
  MusilogyArtistView,
  MusilogyHomeView,
  type MusilogyState,
  type SearchState,
} from '../musilogy/MusilogyView';

// A search waits for a pause in typing: one request per pause, not per key.
const SEARCH_PAUSE_MS = 300;

const seenArtists = seenStore<MusilogyState>();

function MusilogyArtist({ mbid }: { mbid: string }) {
  const [loaded, setLoaded] = useState<{ mbid: string; state: MusilogyState } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetchMusilogyArtist(mbid, controller.signal)
      .then((artist) => {
        const next: MusilogyState = artist ? { status: 'ready', artist } : { status: 'missing' };
        seenArtists.set(mbid, next);
        setLoaded({ mbid, state: next });
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === 'AbortError') return;
        setLoaded({
          mbid,
          state: { status: err instanceof MusilogyUnavailableError ? 'unavailable' : 'error' },
        });
      });
    return () => controller.abort();
  }, [mbid]);

  // Derived, so another artist never flashes the previous one.
  const state: MusilogyState =
    loaded !== null && loaded.mbid === mbid
      ? loaded.state
      : (seenArtists.get(mbid) ?? { status: 'loading' });

  useScrollMemory(state.status !== 'loading');
  const location = useLocation();
  const trail = useDiscoveryTrail(
    // An artist the antenna played is redirected: its step is its artist page's.
    state.status === 'ready' && !state.artist.card.played
      ? { path: location.pathname, name: state.artist.card.name }
      : null
  );

  const name = state.status === 'ready' ? state.artist.card.name : null;
  useEffect(() => {
    document.title = `${name ?? m.musilogy_title()} · AubeSonore`;
  }, [name]);

  // One page per artist: an artist the antenna played has theirs, with Musilogy's sections in it.
  if (state.status === 'ready' && state.artist.card.played) {
    // The trail goes on to the artist page: the link that led here led there.
    return (
      <Navigate
        to={artistPath(state.artist.card.played)}
        replace
        state={location.state as { discovery?: boolean } | null}
      />
    );
  }
  return <MusilogyArtistView state={state} trail={trail} />;
}

function MusilogyHome() {
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState<SearchState>({ status: 'idle' });

  useEffect(() => {
    document.title = `${m.musilogy_title()} · AubeSonore`;
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setSearch({ status: 'searching' });
      searchMusilogy(trimmed, controller.signal)
        .then((hits) => setSearch({ status: 'done', hits }))
        .catch((err: unknown) => {
          if (err instanceof Error && err.name === 'AbortError') return;
          setSearch({ status: err instanceof MusilogyUnavailableError ? 'unavailable' : 'error' });
        });
    }, SEARCH_PAUSE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  return (
    <MusilogyHomeView
      query={query}
      onQueryChange={setQuery}
      search={query.trim().length < 2 ? { status: 'idle' } : search}
    />
  );
}

export default function MusilogyPage() {
  const { mbid } = useParams<{ mbid: string }>();
  const setListenVisible = useHeroListenVisible((s) => s.setVisible);

  // No hero here: the player bar is the only way to listen.
  useEffect(() => setListenVisible(false), [setListenVisible]);

  useEffect(() => {
    const previous = document.title;
    return () => {
      document.title = previous;
    };
  }, []);

  return (
    <>
      {mbid ? <MusilogyArtist mbid={mbid} /> : <MusilogyHome />}
      <SiteFooter />
    </>
  );
}
