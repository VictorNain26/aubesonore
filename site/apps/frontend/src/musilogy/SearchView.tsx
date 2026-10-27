import { useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Link } from 'react-router';
import type { MusilogySearchHit } from '@aubesonore/shared-types/client';
import * as m from '@/paraglide/messages.js';
import { LineLoader } from '../design/LineLoader';
import { SearchField } from '../design/SearchField';
import { KIND_LABELS } from '../lib/artistKind';
import { ARTIST_LINK, STRETCHED } from '../design/classes';
import { cn } from '@/lib/utils';
import { DISCOVERY } from '../lib/discoveryTrail';
import { pagePathOf } from '../lib/musilogy';

function Empty({ text }: { text: string }) {
  return <p className="text-text-muted m-0">{text}</p>;
}

export type SearchState =
  | { status: 'idle' }
  /** `hits`: the last answer, kept on screen while the next one comes. */
  | { status: 'searching'; hits: MusilogySearchHit[] }
  | { status: 'unavailable' }
  | { status: 'error' }
  | { status: 'done'; hits: MusilogySearchHit[] };

/** A row: the name, a link to the page; under it what it is and what tells it apart; its start. */
function SearchHitRow({ hit }: { hit: MusilogySearchHit }) {
  const kind = hit.kind ? KIND_LABELS[hit.kind]() : null;
  return (
    <li className="reveal wave-rule grid min-h-18 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 py-2.5 focus-within:animate-none">
      <span className="flex min-w-0 flex-col gap-0.5">
        <Link
          to={pagePathOf(hit)}
          state={DISCOVERY}
          className={cn(ARTIST_LINK, STRETCHED, 'text-row self-start truncate underline-offset-4')}
        >
          {hit.name}
        </Link>
        {hit.disambiguation || kind ? (
          <span className="text-sub text-text-muted truncate">
            {kind}
            {kind && hit.disambiguation ? ' · ' : null}
            {/* MusicBrainz writes its disambiguations in English, whatever the page's language. */}
            {hit.disambiguation ? <span lang="en">{hit.disambiguation}</span> : null}
          </span>
        ) : null}
      </span>
      <span className="text-ui text-text-muted whitespace-nowrap tabular-nums">
        {hit.y0 ?? null}
      </span>
    </li>
  );
}

function SearchHits({ hits, stale }: { hits: MusilogySearchHit[]; stale: boolean }) {
  return (
    <ol
      className={cn(
        'ease-out-quart m-0 list-none p-0 transition-opacity duration-150',
        stale && 'opacity-50'
      )}
    >
      {hits.map((hit) => (
        <SearchHitRow key={hit.mbid} hit={hit} />
      ))}
    </ol>
  );
}

// Less visual viewport than layout viewport by this much: an on-screen keyboard covers the page
// (a desktop or a hardware keyboard never does). The margin absorbs iOS 26.0, whose visual
// viewport stays ~24 px short after the keyboard closes (https://bugs.webkit.org/show_bug.cgi?id=297779).
const KEYBOARD_MIN = 100;

/** Musilogy's entry, in one column: what it is, a search for any artist right under it, its answers. */
export function MusilogyHomeView({
  query,
  onQueryChange,
  search,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  search: SearchState;
}) {
  const searchRef = useRef<HTMLDivElement>(null);
  const liftedThisFocus = useRef(false);
  const [lifted, setLifted] = useState(false);

  // On a phone the keyboard hides the answers under the field: at the first letter of each focus
  // (the keyboard is open by then, Safari's own focus scroll is over), the field goes to the top.
  const liftAboveKeyboard = () => {
    if (liftedThisFocus.current) return;
    liftedThisFocus.current = true;
    const viewport = window.visualViewport;
    if (!viewport || window.innerHeight - viewport.height < KEYBOARD_MIN) return;
    // The answers hold a screen's height, or a short page could not scroll the field that far.
    flushSync(() => setLifted(true));
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    searchRef.current?.scrollIntoView({ block: 'start', behavior: reduce ? 'auto' : 'smooth' });
  };

  return (
    <main
      id="main"
      // One column, a reading measure wide: the title, what Musilogy is, the field large right
      // under them, the answers.
      className="lift-in px-page flex flex-1 flex-col pt-4 pb-16 md:pt-14 md:pb-24"
    >
      <div className="flex max-w-6xl flex-col">
        <div className="flex flex-col gap-3.5">
          <h1 className="font-display text-page m-0">{m.musilogy_title()}</h1>
          <p className="text-intro text-text-muted m-0">{m.musilogy_lead()}</p>
        </div>

        <SearchField
          ref={searchRef}
          label={m.musilogy_search_label()}
          placeholder={m.musilogy_search_placeholder()}
          query={query}
          onQueryChange={onQueryChange}
          onType={liftAboveKeyboard}
          onFocus={() => {
            liftedThisFocus.current = false;
          }}
          large
          className="mt-6 scroll-mt-4 md:mt-9"
        />

        <div aria-live="polite" className={cn('mt-7', lifted && query && 'min-h-svh')}>
          {search.status === 'idle' ? (
            <p className="text-text-muted m-0">{m.musilogy_search_hint()}</p>
          ) : search.status === 'unavailable' ? (
            <Empty text={m.musilogy_unavailable_body()} />
          ) : search.status === 'error' ? (
            <Empty text={m.musilogy_search_error()} />
          ) : search.status === 'searching' ? (
            search.hits.length > 0 ? (
              <SearchHits hits={search.hits} stale />
            ) : (
              <LineLoader className="min-h-90" />
            )
          ) : search.hits.length > 0 ? (
            <SearchHits hits={search.hits} stale={false} />
          ) : (
            <Empty text={m.musilogy_search_empty()} />
          )}
        </div>
      </div>
    </main>
  );
}
