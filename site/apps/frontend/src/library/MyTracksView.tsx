import { memo } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, ExternalLink, Search, X } from 'lucide-react';
import { Link } from 'react-router';
import { cn } from '@/lib/utils';
import { getLocale } from '@/paraglide/runtime.js';
import { Cover } from '../home/Cover';
import { KeepHeart } from '../home/KeepHeart';
import { ARTIST_LINK, TEXT_ACTION } from '../home/styles';
import { artistPath } from '../lib/artistProfile';
import type { LikedTrack } from '../lib/api';
import { artistNameOf, nextSort, type KeptSort, type SortKey } from './order';
import * as m from '@/paraglide/messages.js';

export type MyTracksState =
  | { status: 'signed-out'; signInHref: string; from: string }
  | { status: 'loading' }
  | { status: 'error'; onRetry: () => void }
  /** `tracks` are those the search lets through, out of `total` kept. */
  | { status: 'ready'; tracks: readonly LikedTrack[]; total: number };

const ICON_ACTION =
  'ease-out-quart focus-visible:outline-accent flex size-11 items-center justify-center rounded-full transition-[opacity,scale] duration-150 hover:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-90';

const PILL =
  'text-ui border-accent ease-out-quart hover:bg-accent hover:text-on-accent focus-visible:outline-accent inline-flex min-h-11 items-center self-start rounded-full border px-4.5 transition-[color,background-color,scale] duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-97';

// One formatter per locale and form: a library holds up to 500 rows.
const keptOnFormats = new Map<string, Intl.DateTimeFormat>();

function keptOn(iso: string, thisYear: number): string {
  const date = new Date(iso);
  const withYear = date.getFullYear() !== thisYear;
  const key = `${getLocale()}|${withYear}`;
  let format = keptOnFormats.get(key);
  if (!format) {
    format = new Intl.DateTimeFormat(getLocale(), {
      day: 'numeric',
      month: 'short',
      ...(withYear ? { year: 'numeric' } : {}),
    });
    keptOnFormats.set(key, format);
  }
  return format.format(date);
}

interface RowProps {
  track: LikedTrack;
  thisYear: number;
  /** Not read: a row redraws when the language changes. */
  locale: string;
  onRemove: (id: string, title: string) => void;
}

// Each refresh of the library hands new objects for the same tracks: a row redraws only when
// what it shows changed, not the whole list at every refresh.
function sameRow(a: RowProps, b: RowProps): boolean {
  const [x, y] = [a.track, b.track];
  return (
    a.thisYear === b.thisYear &&
    a.locale === b.locale &&
    a.onRemove === b.onRemove &&
    x.id === y.id &&
    x.title === y.title &&
    x.artist === y.artist &&
    x.artworkUrl === y.artworkUrl &&
    x.youtubeUrl === y.youtubeUrl &&
    x.createdAt === y.createdAt &&
    x.artistPage?.slug === y.artistPage?.slug &&
    x.artistPage?.name === y.artistPage?.name
  );
}

// On a wide screen: cover, title, artist, date added, actions, each in its column.
const WIDE_COLUMNS = 'md:grid-cols-[2.75rem_minmax(0,5fr)_minmax(0,4fr)_7rem_5.5rem] md:gap-x-6';

const ROW = `grid grid-cols-[2.75rem_minmax(0,1fr)_auto] items-center gap-x-3 ${WIDE_COLUMNS}`;

function ArtistName({ track, className }: { track: LikedTrack; className?: string }) {
  const artist = artistNameOf(track);
  return track.artistPage ? (
    // Negative margins grow the tap target to 44px without moving the row.
    <Link
      to={artistPath(track.artistPage)}
      className={cn(ARTIST_LINK, '-my-3 min-w-0 truncate py-3 underline-offset-4', className)}
    >
      {artist}
    </Link>
  ) : (
    <span className={cn('min-w-0 truncate', className)}>{artist}</span>
  );
}

const Row = memo(function Row({ track, thisYear, onRemove }: RowProps) {
  return (
    <li className={cn(ROW, 'border-border min-h-18 gap-y-0.5 border-b py-2.5')}>
      <Cover
        src={track.artworkUrl}
        alt=""
        seed={`${track.artist}|${track.title}`}
        className="row-span-2 size-11 md:row-span-1"
        size={160}
      />
      <span className="text-row self-end truncate md:self-center">{track.title}</span>
      {/* On a phone the artist and the date share the line under the title; on a wide screen the
          wrapper steps aside and each takes its column. */}
      <span className="text-sub text-text-muted col-start-2 row-start-2 flex min-w-0 items-baseline gap-1.5 self-start md:contents">
        <ArtistName track={track} />
        <span aria-hidden="true" className="md:hidden">
          ·
        </span>
        <time dateTime={track.createdAt} className="shrink-0 whitespace-nowrap">
          {keptOn(track.createdAt, thisYear)}
        </time>
      </span>
      <span className="col-start-3 row-span-2 row-start-1 flex items-center md:col-start-5 md:row-span-1">
        <a
          href={track.youtubeUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={m.library_listen({ title: track.title })}
          title={m.library_listen({ title: track.title })}
          className={ICON_ACTION}
        >
          <ExternalLink className="size-4.5" strokeWidth={1.6} aria-hidden="true" />
        </a>
        <button
          type="button"
          onClick={() => onRemove(track.id, track.title)}
          aria-label={m.track_unkeep_aria({ title: track.title })}
          title={m.track_unkeep_aria({ title: track.title })}
          className={ICON_ACTION}
        >
          <KeepHeart isKept className="size-4.5" />
        </button>
      </span>
    </li>
  );
}, sameRow);

function Skeleton() {
  return (
    <ol aria-busy="true" className="m-0 list-none p-0">
      {Array.from({ length: 6 }, (_, i) => (
        <li key={i} className="border-border flex min-h-18 items-center gap-3 border-b py-2.5">
          <span className="bg-surface-raised size-11 shrink-0 rounded-sm" />
          <span className="bg-surface-raised h-4 w-1/2 rounded-sm" />
        </li>
      ))}
    </ol>
  );
}

/** Search the kept tracks by title or artist; Échap clears it. */
function SearchField({
  query,
  onQueryChange,
}: {
  query: string;
  onQueryChange: (query: string) => void;
}) {
  return (
    <div role="search" className="relative w-full sm:max-w-md">
      <label>
        <span className="sr-only">{m.library_search_label()}</span>
        <Search
          className="text-text-muted pointer-events-none absolute top-1/2 left-4 size-4.5 -translate-y-1/2"
          strokeWidth={1.8}
          aria-hidden="true"
        />
        <input
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onQueryChange('');
          }}
          placeholder={m.library_search_placeholder()}
          autoComplete="off"
          className="text-ui border-accent ease-out-quart placeholder:text-text-faint hover:bg-surface-raised focus-visible:outline-accent h-11 w-full rounded-full border bg-transparent pr-12 pl-11 transition-colors duration-150 focus-visible:bg-transparent focus-visible:outline-2 focus-visible:outline-offset-2 [&::-webkit-search-cancel-button]:hidden"
        />
      </label>
      {query ? (
        <button
          type="button"
          onClick={() => onQueryChange('')}
          aria-label={m.library_search_clear()}
          className={cn(ICON_ACTION, 'absolute top-0 right-0')}
        >
          <X className="size-4" strokeWidth={1.8} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}

const SORT_BUTTON =
  'group text-label text-text-muted ease-out-quart hover:text-text focus-visible:outline-accent -mx-1 inline-flex min-h-11 items-center gap-1.5 justify-self-start rounded-sm px-1 font-mono uppercase transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 active:opacity-70';

/**
 * The columns' names, each a sort: a click orders the list by it, a second click reverses it. On a
 * phone, where the row has no columns, the same three buttons sit in a line above the list.
 */
function SortHeader({
  sort,
  onSortChange,
}: {
  sort: KeptSort;
  onSortChange: (s: KeptSort) => void;
}) {
  const columns: readonly { key: SortKey; label: string }[] = [
    { key: 'title', label: m.library_col_title() },
    { key: 'artist', label: m.library_col_artist() },
    { key: 'added', label: m.library_col_added() },
  ];
  return (
    <div
      role="group"
      aria-label={m.library_order_label()}
      className={cn('border-border flex items-center gap-x-6 border-b pb-1 md:grid', WIDE_COLUMNS)}
    >
      <span className="hidden md:block" />
      {columns.map(({ key, label }) => {
        const active = sort.key === key;
        const Arrow = !active ? ArrowUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown;
        return (
          <button
            key={key}
            type="button"
            onClick={() => onSortChange(nextSort(sort, key))}
            className={cn(SORT_BUTTON, active && 'text-text')}
          >
            {label}
            {active ? (
              <span className="sr-only">
                , {sort.dir === 'asc' ? m.library_sort_asc() : m.library_sort_desc()}
              </span>
            ) : null}
            <Arrow
              className={cn(
                'size-3.5',
                !active && 'opacity-0 group-hover:opacity-60 group-focus-visible:opacity-60'
              )}
              strokeWidth={2}
              aria-hidden="true"
            />
          </button>
        );
      })}
      <span className="hidden md:block" />
    </div>
  );
}

/**
 * "Mes titres": every kept track, searched by title or artist, sorted by any of its columns, the
 * artist's name leading to their page, with a link to play it on YouTube and the heart to let it go.
 */
export function MyTracksView({
  state,
  sort,
  onSortChange,
  query,
  onQueryChange,
  onRemove,
  thisYear = new Date().getFullYear(),
}: {
  state: MyTracksState;
  sort: KeptSort;
  onSortChange: (sort: KeptSort) => void;
  query: string;
  onQueryChange: (query: string) => void;
  onRemove: (id: string, title: string) => void;
  thisYear?: number;
}) {
  const total = state.status === 'ready' ? state.total : 0;
  const shown = state.status === 'ready' ? state.tracks.length : 0;
  const locale = getLocale();
  return (
    <main
      id="main"
      className="lift-in px-page flex flex-1 flex-col gap-10 pt-10 pb-16 md:gap-12 md:pt-16 md:pb-24"
    >
      <div className="flex flex-col gap-3">
        {total > 0 ? (
          <span className="text-label text-text-muted font-mono uppercase" aria-live="polite">
            {query.trim()
              ? m.library_count_filtered({ shown, count: total })
              : total > 1
                ? m.library_count_other({ count: total })
                : m.library_count_one()}
          </span>
        ) : null}
        <h1 className="text-section m-0">{m.library_title()}</h1>
        <p className="text-intro text-text-muted max-w-blurb m-0">{m.library_body()}</p>
      </div>

      {state.status === 'signed-out' ? (
        <div className="flex flex-col gap-5">
          <p className="text-row m-0">{m.library_signed_out()}</p>
          <Link to={state.signInHref} state={{ from: state.from }} className={PILL}>
            {m.nav_sign_in()}
          </Link>
        </div>
      ) : state.status === 'loading' ? (
        <Skeleton />
      ) : state.status === 'error' ? (
        <div className="flex flex-col gap-3">
          <p className="text-row m-0">{m.library_error()}</p>
          <button type="button" onClick={state.onRetry} className={cn(TEXT_ACTION, 'self-start')}>
            {m.error_retry()}
          </button>
        </div>
      ) : state.total === 0 ? (
        <div className="flex flex-col gap-1">
          <p className="text-row m-0">{m.library_empty_title()}</p>
          <p className="text-text-muted m-0">{m.library_empty_body()}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <SearchField query={query} onQueryChange={onQueryChange} />
          {state.tracks.length === 0 ? (
            <div className="border-border flex flex-col items-start gap-3 border-t pt-8">
              <p className="text-row m-0">{m.library_search_empty({ query: query.trim() })}</p>
              <button type="button" onClick={() => onQueryChange('')} className={TEXT_ACTION}>
                {m.library_search_clear()}
              </button>
            </div>
          ) : (
            <div>
              <SortHeader sort={sort} onSortChange={onSortChange} />
              <ol className="m-0 list-none p-0">
                {state.tracks.map((track) => (
                  <Row
                    key={track.id}
                    track={track}
                    thisYear={thisYear}
                    locale={locale}
                    onRemove={onRemove}
                  />
                ))}
              </ol>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
