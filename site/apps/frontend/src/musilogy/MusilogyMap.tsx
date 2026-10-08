import type { CSSProperties } from 'react';
import { Link } from 'react-router';
import type {
  MusilogyArtist,
  MusilogyCard,
  MusilogyNeighbour,
} from '@aubesonore/shared-types/client';
import * as m from '@/paraglide/messages.js';
import { cn } from '@/lib/utils';
import { ARTIST_LINK } from '../home/styles';
import { DISCOVERY } from '../lib/discoveryTrail';
import { pagePathOf } from '../lib/musilogy';

// A decade's column holds this many names; a fuller decade gets more columns, and more width.
const PER_COLUMN = 20;

export interface Close {
  artist: MusilogyNeighbour;
}

/** Every neighbour, the closest first. */
export function closestOf({ neighbours }: MusilogyArtist): Close[] {
  if (!neighbours) return [];
  return (
    [...neighbours.before, ...neighbours.during, ...neighbours.after, ...neighbours.undated]
      // By rank, not score: musilogy settles equal scores, which are common
      // among artists with few listeners.
      .sort((a, b) => a.rank - b.rank)
      .map((artist) => ({ artist }))
  );
}

export interface Decade {
  /** Its first year: 1990 for the 1990s. */
  decade: number;
  /** The neighbours who started in it, by year, the closest first within a year. */
  close: Close[];
  /** Whether the artist was active in it. */
  own: boolean;
  /** Columns its names take where the decades stand side by side. */
  columns: number;
}

export interface Decades {
  decades: Decade[];
  /** Neighbours whose start is unknown, the closest first. */
  undated: Close[];
}

/**
 * The neighbours by the decade they started in, each decade a little chronology; the decades with
 * a neighbour, and the one the artist started in, where its name stands.
 */
export function byDecade(artist: MusilogyArtist, thisYear: number): Decades {
  const all = closestOf(artist);
  const { card } = artist;
  const decadeOf = (year: number) => Math.floor(year / 10) * 10;
  const own = new Set<number>();
  if (card.y0 !== null) {
    const end = card.ended ? (card.yEnd ?? card.y0) : thisYear;
    for (let decade = decadeOf(card.y0); decade <= decadeOf(end); decade += 10) own.add(decade);
  }
  const groups = new Map<number, Close[]>();
  for (const close of all) {
    if (close.artist.y0 === null) continue;
    const decade = decadeOf(close.artist.y0);
    groups.set(decade, [...(groups.get(decade) ?? []), close]);
  }
  for (const close of groups.values()) {
    // Stable: within a year, the closest stays first.
    close.sort((a, b) => (a.artist.y0 as number) - (b.artist.y0 as number));
  }
  const first = card.y0 === null ? null : decadeOf(card.y0);
  // An active decade with no neighbour would be an empty column, but the first holds the name.
  const shown = [...own].filter((decade) => decade === first || groups.has(decade));
  const decades = [...new Set([...groups.keys(), ...shown])]
    .sort((a, b) => a - b)
    .map((decade) => {
      const close = groups.get(decade) ?? [];
      return {
        decade,
        close,
        own: own.has(decade),
        columns: Math.max(1, Math.ceil(close.length / PER_COLUMN)),
      };
    });
  return { decades, undated: all.filter((close) => close.artist.y0 === null) };
}

/** A neighbour's name, a link to its page; `quiet`, underlined only when pointed at or focused. */
function NameLink({ close, quiet = false }: { close: Close; quiet?: boolean }) {
  return (
    <Link
      to={pagePathOf(close.artist)}
      state={DISCOVERY}
      className={cn(
        ARTIST_LINK,
        'underline-offset-4',
        // Underlines side by side read as noise; a pointer finds the links on its own.
        quiet && 'no-underline hover:underline focus-visible:underline',
        'text-text font-bold'
      )}
    >
      {close.artist.name}
      {close.artist.y0 === null ? null : <span className="sr-only">, {close.artist.y0}</span>}
    </Link>
  );
}

/** The artist itself, where it stands among its neighbours. */
function Own({ card }: { card: MusilogyCard }) {
  return (
    <p className="text-ui m-0 flex items-baseline gap-2 font-semibold">
      <span aria-hidden="true" className="bg-accent size-2 shrink-0 self-center rounded-full" />
      {card.name}
      {card.y0 === null ? null : (
        <span className="text-text-muted font-mono font-normal tabular-nums">{card.y0}</span>
      )}
    </p>
  );
}

/** Side by side where the container is 60rem wide or more: time runs left to right. */
function Columns({ card, decades }: { card: MusilogyCard; decades: Decade[] }) {
  const firstOwn = decades.find((decade) => decade.own)?.decade;
  const template: CSSProperties = {
    gridTemplateColumns: decades.map((decade) => `minmax(0, ${decade.columns}fr)`).join(' '),
  };
  return (
    <div className="grid gap-x-1" style={template}>
      {decades.map((decade) => (
        <section
          key={decade.decade}
          aria-label={m.musilogy_decade({ decade: String(decade.decade) })}
          className={cn(
            'border-text-muted flex min-w-0 flex-col gap-3 border-t px-3 pt-2 pb-4',
            decade.own && 'bg-surface-raised border-accent rounded-b-sm border-t-2'
          )}
        >
          <h3 className="text-label text-text-muted m-0 font-mono font-normal">{decade.decade}</h3>
          {decade.decade === firstOwn ? <Own card={card} /> : null}
          {decade.close.length > 0 ? (
            <ol
              className="text-ui m-0 list-none gap-x-4 p-0"
              style={{ columnCount: decade.columns }}
            >
              {decade.close.map((close) => (
                <li
                  key={close.artist.mbid}
                  className="reveal-early grid break-inside-avoid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-2 py-1 leading-snug"
                >
                  <span aria-hidden="true" className="text-caption text-text-muted font-mono">
                    {close.artist.y0}
                  </span>
                  <span className="min-w-0">
                    <NameLink close={close} quiet />
                  </span>
                </li>
              ))}
            </ol>
          ) : null}
        </section>
      ))}
    </div>
  );
}

/** One decade under the other for a narrower container, its names running on as text. */
function Stacked({ card, decades }: { card: MusilogyCard; decades: Decade[] }) {
  const firstOwn = decades.find((decade) => decade.own)?.decade;
  return (
    <div className="flex flex-col">
      {decades.map((decade) => (
        <section
          key={decade.decade}
          aria-label={m.musilogy_decade({ decade: String(decade.decade) })}
          className={cn(
            'border-border flex flex-col gap-2 border-t py-4',
            decade.own && 'bg-surface-raised border-accent -mx-3 border-t-2 px-3'
          )}
        >
          <h3 className="text-label text-text-muted m-0 font-mono font-normal">{decade.decade}</h3>
          {decade.decade === firstOwn ? <Own card={card} /> : null}
          {decade.close.length > 0 ? (
            <ol className="text-ui m-0 flex list-none flex-wrap gap-x-1 gap-y-2 p-0 leading-snug">
              {decade.close.map((close, i) => (
                <li key={close.artist.mbid} className="reveal-early">
                  <NameLink close={close} />
                  <span aria-hidden="true" className="text-caption text-text-muted font-mono">
                    {' '}
                    {close.artist.y0}
                  </span>
                  {i < decade.close.length - 1 ? (
                    <span aria-hidden="true" className="text-text-muted">
                      {' '}
                      ·
                    </span>
                  ) : null}
                </li>
              ))}
            </ol>
          ) : null}
        </section>
      ))}
    </div>
  );
}

/**
 * Every close neighbour of the artist, by the decade it started in: the decades side by side
 * where the container is wide, one under the other where it is not, the artist's own decades
 * marked; in each, by year. Those whose start is unknown close the section.
 */
export function MusilogyMap({ artist, thisYear }: { artist: MusilogyArtist; thisYear: number }) {
  const { decades, undated } = byDecade(artist, thisYear);
  if (decades.every((decade) => decade.close.length === 0) && undated.length === 0) return null;

  return (
    <div className="@container flex flex-col gap-6">
      <div className="hidden @min-[60rem]:block">
        <Columns card={artist.card} decades={decades} />
      </div>
      <div className="@min-[60rem]:hidden">
        <Stacked card={artist.card} decades={decades} />
      </div>
      {undated.length > 0 ? (
        <section
          aria-label={m.musilogy_undated_title()}
          className="text-ui flex flex-wrap items-baseline gap-x-4 gap-y-2"
        >
          <h3 className="text-label text-text-muted m-0 font-mono font-normal">
            {m.musilogy_undated_title()}
          </h3>
          <ol className="m-0 flex list-none flex-wrap gap-x-4 gap-y-2 p-0">
            {undated.map((close) => (
              <li key={close.artist.mbid} className="reveal-early">
                <NameLink close={close} quiet />
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  );
}
