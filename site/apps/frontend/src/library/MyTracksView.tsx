import { ExternalLink } from 'lucide-react';
import { Link } from 'react-router';
import { cn } from '@/lib/utils';
import { getLocale } from '@/paraglide/runtime.js';
import { SiteHeader } from '../home/SiteHeader';
import { Cover } from '../home/Cover';
import { ARTIST_LINK, TEXT_ACTION } from '../home/styles';
import { artistPath } from '../lib/artistProfile';
import type { ArtistGroup } from './groups';
import * as m from '@/paraglide/messages.js';

export type MyTracksState =
  | { status: 'signed-out'; signInHref: string; from: string }
  | { status: 'loading' }
  | { status: 'error'; onRetry: () => void }
  | { status: 'ready'; groups: ArtistGroup[]; count: number };

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
      month: 'long',
      ...(withYear ? { year: 'numeric' } : {}),
    });
    keptOnFormats.set(key, format);
  }
  return m.library_kept_on({ date: format.format(date) });
}

function Group({
  group,
  index,
  thisYear,
  onRemove,
}: {
  group: ArtistGroup;
  index: number;
  thisYear: number;
  onRemove: (id: string, title: string) => void;
}) {
  const headingId = `artist-${index}`;
  return (
    <section aria-labelledby={headingId} className="reveal flex flex-col gap-2">
      <h2 id={headingId} className="text-headline m-0 min-w-0">
        {group.page ? (
          <Link
            to={artistPath(group.page)}
            className={cn(ARTIST_LINK, 'inline-flex min-h-11 items-center underline-offset-6')}
          >
            {group.name}
          </Link>
        ) : (
          <span className="inline-flex min-h-11 items-center">{group.name}</span>
        )}
      </h2>
      <ol className="m-0 list-none p-0">
        {group.tracks.map((track) => (
          <li
            key={track.id}
            className="border-border grid min-h-16 grid-cols-[2.75rem_minmax(0,1fr)_2.75rem_auto] items-center gap-x-3 border-b py-2 md:gap-x-4 md:px-1"
          >
            <Cover
              src={track.artworkUrl}
              alt=""
              seed={`${track.artist}|${track.title}`}
              className="size-11"
            />
            <span className="flex min-w-0 flex-col">
              <span className="text-row truncate">{track.title}</span>
              <span className="text-caption text-text-muted font-normal">
                {keptOn(track.createdAt, thisYear)}
              </span>
            </span>
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
              className={cn(TEXT_ACTION, 'text-text-muted hover:text-text px-1 font-normal')}
            >
              {m.library_remove()}
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Skeleton() {
  return (
    <ol aria-busy="true" className="m-0 list-none p-0">
      {Array.from({ length: 6 }, (_, i) => (
        <li key={i} className="border-border flex min-h-16 items-center gap-3 border-b py-2">
          <span className="bg-surface-raised size-11 shrink-0 rounded-sm" />
          <span className="bg-surface-raised h-4 w-1/2 rounded-sm" />
        </li>
      ))}
    </ol>
  );
}

/**
 * "Mes titres": every kept track under its artist, whose name leads to their page, with a link to
 * play it on YouTube and a way to let it go.
 */
export function MyTracksView({
  state,
  onRemove,
  thisYear = new Date().getFullYear(),
}: {
  state: MyTracksState;
  onRemove: (id: string, title: string) => void;
  thisYear?: number;
}) {
  return (
    <main id="main" className="min-h-dvh">
      <SiteHeader />
      <div className="lift-in px-page grid gap-8 pt-10 pb-16 md:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] md:gap-16 md:pt-16 md:pb-28">
        <div className="flex flex-col gap-2 self-start md:sticky md:top-10 md:gap-3">
          {state.status === 'ready' && state.count > 0 ? (
            <span className="text-label text-text-muted font-mono uppercase">
              {state.count > 1
                ? m.library_count_other({ count: state.count })
                : m.library_count_one()}
            </span>
          ) : null}
          <h1 className="text-section m-0">{m.library_title()}</h1>
          <p className="text-intro text-text-muted max-w-blurb m-0">{m.library_body()}</p>
        </div>

        <div className="flex min-w-0 flex-col gap-10 md:gap-14">
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
              <button type="button" onClick={state.onRetry} className={TEXT_ACTION}>
                {m.error_retry()}
              </button>
            </div>
          ) : state.groups.length === 0 ? (
            <div className="flex flex-col gap-1">
              <p className="text-row m-0">{m.library_empty_title()}</p>
              <p className="text-text-muted m-0">{m.library_empty_body()}</p>
            </div>
          ) : (
            state.groups.map((group, index) => (
              <Group
                key={group.key}
                group={group}
                index={index}
                thisYear={thisYear}
                onRemove={onRemove}
              />
            ))
          )}
        </div>
      </div>
    </main>
  );
}
