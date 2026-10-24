import { useEffect, useState } from 'react';
import { usePageTitle } from '../hooks/usePageTitle';
import * as m from '@/paraglide/messages.js';
import { SiteFooter } from '../shell/SiteFooter';
import { SiteHeader } from '../shell/SiteHeader';
import { MusilogyUnavailableError, searchMusilogy } from '../lib/musilogy';
import { MusilogyHomeView, type SearchState } from '../musilogy/SearchView';

// A search waits for a pause in typing: one request per pause, not per key.
const SEARCH_PAUSE_MS = 300;

function MusilogyHome() {
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState<SearchState>({ status: 'idle' });

  usePageTitle(m.musilogy_title());

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
      onQueryChange={(next) => {
        setQuery(next);
        // Under two letters there is no search: an earlier answer must not come back as the
        // previous one of the next search.
        if (next.trim().length < 2) setSearch({ status: 'idle' });
      }}
      search={query.trim().length < 2 ? { status: 'idle' } : search}
    />
  );
}

export function MusilogyPage() {
  return (
    <div className="min-h-page flex flex-col">
      <SiteHeader />
      <MusilogyHome />
      <SiteFooter />
    </div>
  );
}
