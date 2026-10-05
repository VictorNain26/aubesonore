import { useEffect, useState } from 'react';
import { Navigate, useLocation, useParams } from 'react-router';
import * as m from '@/paraglide/messages.js';
import { useHeroListenVisible } from '../home/listen';
import { SiteFooter } from '../home/SiteFooter';
import { SiteHeader } from '../home/SiteHeader';
import { MusilogyUnavailableError, searchMusilogy } from '../lib/musilogy';
import { artistPath } from '../lib/artistProfile';
import { MusilogyHomeView, type SearchState } from '../musilogy/MusilogyView';

// A search waits for a pause in typing: one request per pause, not per key.
const SEARCH_PAUSE_MS = 300;

/**
 * The old address of an artist's Musilogy page: one page per artist now, at
 * its MBID, which sends a played artist on to its slug. A walk from artist to
 * artist keeps its trail through it.
 */
function MusilogyArtist({ mbid }: { mbid: string }) {
  const location = useLocation();
  return (
    <Navigate
      to={artistPath({ slug: mbid })}
      replace
      state={location.state as { discovery?: boolean } | null}
    />
  );
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
      setSearch((previous) => ({
        status: 'searching',
        hits: previous.status === 'done' || previous.status === 'searching' ? previous.hits : [],
      }));
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

  if (mbid) return <MusilogyArtist mbid={mbid} />;
  return (
    <div className="min-h-page flex flex-col">
      <SiteHeader />
      <MusilogyHome />
      <SiteFooter />
    </div>
  );
}
