import { memo } from 'react';
import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon, PlayIcon } from '../design/icons';
import { Link } from 'react-router';
import { cn } from '@/lib/utils';
import { getLocale } from '@/paraglide/runtime.js';
import { CoverOpenLarge } from '../design/CoverOpenLarge';
import { KeepHeart } from '../design/KeepHeart';
import { ARTIST_LINK, ICON_ACTION, OUTLINE_ACTION, TEXT_ACTION } from '../design/classes';
import { SearchField } from '../design/SearchField';
import { artistPath } from '../lib/artistProfile';
import type { LikedTrack } from '../lib/api';
import { artistNameOf, nextSort, type KeptSort, type SortKey } from './order';
import * as m from '@/paraglide/messages.js';
import { LineLoader } from '../design/LineLoader';

export type MyTracksState =
  | { status: 'signed-out'; signInHref: string; from: string }
  | { status: 'loading' }
  | { status: 'error'; onRetry: () => void }
  /** `tracks` are those the search lets through, out of `total` kept. */
  | { status: 'ready'; tracks: readonly LikedTrack[]; total: number };

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

/**
 * The focus a removed row leaves goes to the next row's heart, else the one before, else the
 * page's title: the row leaves the page, and with it the focus, to the body.
 */
function focusAfterRemoval(button: HTMLElement): void {
  const row = button.closest('li');
  const neighbour = row?.nextElementSibling ?? row?.previousElementSibling;
  const target =
    neighbour?.querySelector<HTMLElement>('[data-remove]') ??
    button.closest('main')?.querySelector<HTMLElement>('h1');
  target?.focus();
}

const Row = memo(function Row({ track, thisYear, onRemove }: RowProps) {
  return (
    <li className={cn(ROW, 'reveal wave-rule min-h-18 gap-y-0.5 py-2.5 focus-within:animate-none')}>
      <CoverOpenLarge
        src={track.artworkUrl}
        alt=""
        seed={`${track.artist}|${track.title}`}
        label={m.cover_open({ title: track.title })}
        title={track.title}
        largeAlt={m.now_cover_alt({ title: track.title, artist: track.artist })}
        caption={m.track_caption({ title: track.title, artist: track.artist })}
        triggerClassName="row-span-2 size-11 md:row-span-1"
        className="size-11"
        sizes="2.75rem"
      />
      <span className="text-row self-end truncate md:self-center">{track.title}</span>
      {/* Under the title, the artist, then from `sm` the date: a phone's line is too short for both.
          On a wide screen the wrapper steps aside and each takes its column. */}
      <span className="text-sub text-text-muted col-start-2 row-start-2 flex min-w-0 items-baseline gap-1.5 self-start md:contents">
        <ArtistName track={track} />
        <span aria-hidden="true" className="hidden sm:inline md:hidden">
          ·
        </span>
        <time dateTime={track.createdAt} className="hidden shrink-0 whitespace-nowrap sm:inline">
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
          <PlayIcon className="size-4.5" />
        </a>
        <button
          type="button"
          data-remove
          onClick={(event) => {
            focusAfterRemoval(event.currentTarget);
            onRemove(track.id, track.title);
          }}
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

const SORT_BUTTON =
  'group text-caption text-text-muted ease-out-quart hover:text-text focus-visible:outline-accent -mx-1 inline-flex min-h-11 items-center gap-1.5 justify-self-start px-1 transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 active:opacity-70';

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
      className={cn('wave-rule flex items-center gap-x-6 pb-1 md:grid', WIDE_COLUMNS)}
    >
      <span className="hidden md:block" />
      {columns.map(({ key, label }) => {
        const active = sort.key === key;
        const Arrow = !active ? ArrowUpDownIcon : sort.dir === 'asc' ? ArrowUpIcon : ArrowDownIcon;
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
          <span className="text-caption text-text-muted" aria-live="polite">
            {query.trim()
              ? m.library_count_filtered({ shown, count: total })
              : total > 1
                ? m.library_count_other({ count: total })
                : m.library_count_one()}
          </span>
        ) : null}
        {/* Focusable by script only: it takes the focus a last removed row leaves. */}
        <h1 tabIndex={-1} className="font-display text-page m-0 outline-none">
          {m.library_title()}
        </h1>
        <p className="text-intro text-text-muted max-w-blurb m-0">{m.library_body()}</p>
      </div>

      {state.status === 'signed-out' ? (
        <div className="flex flex-col gap-5">
          <p className="text-row m-0">{m.library_signed_out()}</p>
          <Link
            to={state.signInHref}
            state={{ from: state.from }}
            className={cn(OUTLINE_ACTION, 'self-start')}
          >
            {m.nav_sign_in()}
          </Link>
        </div>
      ) : state.status === 'loading' ? (
        <LineLoader className="min-h-108" />
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
          <SearchField
            label={m.library_search_label()}
            placeholder={m.library_search_placeholder()}
            query={query}
            onQueryChange={onQueryChange}
            className="sm:max-w-md"
          />
          {state.tracks.length === 0 ? (
            <div className="wave-rule-top flex flex-col items-start gap-3 pt-8">
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
