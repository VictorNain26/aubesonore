import { useState } from 'react';
import { Link } from 'react-router';
import type {
  MusilogyArtist,
  MusilogyCard,
  MusilogyNeighbour,
} from '@aubesonore/shared-types/client';
import * as m from '@/paraglide/messages.js';
import { cn } from '@/lib/utils';
import { ARTIST_LINK, TEXT_ACTION } from '../home/styles';
import { DISCOVERY } from '../lib/discoveryTrail';
import { pagePathOf } from '../lib/musilogy';

// The closest first, ten more on demand, thirty at most: past that a map no longer reads.
export const FIRST_SHOWN = 10;
const STEP = 10;
const MOST = 30;

// The map is laid out for a container this wide, in pixels. Wider, only the gaps grow, so no two
// labels ever meet; narrower, the list takes its place (@min-[60rem]).
const WIDTH = 960;
const PAD = 16;
// A row is a 44 px target.
const ROW = 44;
// Labels are set in the monospaced face at text-caption, 13 px, so their width is known: Geist
// Mono's advance is 0.6 em, plus the token's 0.01 em of letter spacing.
const CHAR = 13 * 0.61;
const GAP = 8;
const AXIS_LABELS = 24;

/** What Wikidata adds about a neighbour: the artist cites it, or it cites the artist. */
export type Mark = 'influence' | 'inspired';

export interface Close {
  artist: MusilogyNeighbour;
  mark: Mark | null;
}

const MARK_LABELS: Record<Mark, () => string> = {
  influence: () => m.musilogy_mark_influence(),
  inspired: () => m.musilogy_mark_inspired(),
};

/** Every neighbour, the closest first, marked when it is also a declared influence. */
export function closestOf({ neighbours, influences }: MusilogyArtist): Close[] {
  if (!neighbours) return [];
  const cites = new Set(influences?.cites.map((influence) => influence.mbid));
  const citedBy = new Set(influences?.citedBy.map((influence) => influence.mbid));
  return [...neighbours.before, ...neighbours.during, ...neighbours.after, ...neighbours.undated]
    .sort((a, b) => b.score - a.score)
    .map((artist) => ({
      artist,
      mark: cites.has(artist.mbid) ? 'influence' : citedBy.has(artist.mbid) ? 'inspired' : null,
    }));
}

export interface Placed extends Close {
  /** Where the neighbour started, in pixels of the layout width. */
  x: number;
  /** Rows from the axis: positive above it, negative below. */
  row: number;
  anchor: 'start' | 'end';
  /** A neighbour outside the span stands at its edge, its year beside its name. */
  edge: boolean;
  /** What its label covers on its row, in pixels of the layout width. */
  span: [number, number];
}

export interface TimelineLayout {
  height: number;
  axisY: number;
  ticks: Array<{ year: number; x: number }>;
  span: { x0: number; x1: number; anchor: 'start' | 'end' };
  placed: Placed[];
}

function labelOf({ artist, mark }: Close, edge: boolean): string {
  return [
    edge && artist.y0 !== null ? String(artist.y0) : '',
    artist.name,
    mark ? MARK_LABELS[mark]() : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

/** Rows from the axis a neighbour may start at: the three closest nearest, then by threes and tens. */
function nearestRow(rank: number): number {
  if (rank < 3) return 1;
  if (rank < 6) return 2;
  if (rank < 10) return 3;
  return 4 + Math.floor((rank - 10) / STEP);
}

/**
 * Where everything sits: time runs left to right, the artist spans its years on the axis, each
 * neighbour stands at the year it started. The span covers the artist and most neighbours: one far
 * older or younger stands at the edge with its year rather than squeezing the others. The closer a
 * neighbour, the nearer the axis it may stand, and a less close one never takes a row nearer than
 * its rank allows; a label that finds no room flips its side, then the other side of the axis,
 * then moves a row out. Null without a start year to place the artist, or a dated neighbour.
 */
export function layoutTimeline(
  card: MusilogyCard,
  shown: readonly Close[],
  thisYear: number
): TimelineLayout | null {
  if (card.y0 === null) return null;
  const dated = shown.filter((close) => close.artist.y0 !== null);
  if (dated.length === 0) return null;

  // An active artist's span runs to this year, whatever its last album says.
  const end = card.ended ? (card.yEnd ?? card.y0) : thisYear;
  const years = dated.map((close) => close.artist.y0 as number).sort((a, b) => a - b);
  const quantile = (p: number) => years[Math.floor((years.length - 1) * p)] as number;
  const from = Math.floor((Math.min(card.y0, quantile(0.15)) - 2) / 10) * 10;
  const to = Math.ceil((Math.max(end, quantile(0.85)) + 2) / 10) * 10;
  const x = (year: number) =>
    PAD + ((Math.min(Math.max(year, from), to) - from) / (to - from)) * (WIDTH - 2 * PAD);

  const fits = (at: number, width: number, anchor: 'start' | 'end'): [number, number] | null => {
    const span: [number, number] = anchor === 'start' ? [at, at + width] : [at - width, at];
    return span[0] >= 0 && span[1] <= WIDTH ? span : null;
  };
  const preferred = (at: number, width: number): Array<'start' | 'end'> =>
    fits(at, width, 'start') ? ['start', 'end'] : ['end', 'start'];

  const x0 = x(card.y0);
  const x1 = Math.max(x(end), x0 + 4);
  const ownWidth = card.name.length * CHAR + 2 * GAP;
  const ownAnchor = preferred(x1, ownWidth)[0] as 'start' | 'end';

  const taken = new Map<number, Array<[number, number]>>();
  const free = (row: number, span: [number, number]) =>
    (taken.get(row) ?? []).every(([a, b]) => span[1] < a || span[0] > b);

  const placed: Placed[] = [];
  shown.forEach((close, rank) => {
    const year = close.artist.y0;
    if (year === null) return;
    const edge = year < from || year > to;
    const at = x(year);
    const width = labelOf(close, edge).length * CHAR + 2 * GAP;
    for (let distance = nearestRow(rank); ; distance++) {
      for (const row of [distance, -distance]) {
        for (const anchor of preferred(at, width)) {
          const span = fits(at, width, anchor);
          if (span && free(row, span)) {
            taken.set(row, [...(taken.get(row) ?? []), span]);
            placed.push({ ...close, x: at, row, anchor, edge, span });
            return;
          }
        }
      }
    }
  });

  const above = Math.max(0, ...placed.map((p) => p.row));
  const below = Math.max(0, ...placed.map((p) => -p.row));
  const axisY = PAD + above * ROW + ROW / 2;
  const ticks = [];
  for (let year = from; year <= to; year += 10) ticks.push({ year, x: x(year) });

  return {
    height: axisY + below * ROW + ROW / 2 + AXIS_LABELS,
    axisY,
    ticks,
    span: { x0, x1, anchor: ownAnchor },
    placed,
  };
}

const percent = (x: number) => `${(x / WIDTH) * 100}%`;
const LABEL =
  'text-text text-caption absolute flex h-11 min-w-11 -translate-y-1/2 items-center font-mono whitespace-nowrap';

/** One neighbour on the map: its stem down to the axis, its point, its name. */
function Pin({ placed, axisY }: { placed: Placed; axisY: number }) {
  const { artist, mark, x, row, anchor, edge } = placed;
  const y = axisY - row * ROW;
  return (
    <li className="group">
      <span
        aria-hidden="true"
        className="bg-border group-hover:bg-text-muted group-focus-within:bg-text-muted absolute w-px transition-colors duration-150"
        style={{ left: percent(x), top: Math.min(y, axisY), height: Math.abs(y - axisY) }}
      />
      <span
        aria-hidden="true"
        className="bg-text-muted group-hover:bg-text group-focus-within:bg-text absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ left: percent(x), top: y }}
      />
      <Link
        to={pagePathOf(artist)}
        state={DISCOVERY}
        className={cn(LABEL, ARTIST_LINK, 'bg-surface gap-1.5 px-1 no-underline hover:underline')}
        style={{
          top: y,
          ...(anchor === 'start'
            ? { left: `calc(${percent(x)} + ${GAP - 4}px)` }
            : { right: `calc(${100 - (x / WIDTH) * 100}% + ${GAP - 4}px)` }),
        }}
      >
        {edge ? <span className="text-text-muted">{artist.y0} ·</span> : null}
        <span>{artist.name}</span>
        {mark ? <span className="text-text-muted">· {MARK_LABELS[mark]()}</span> : null}
        {edge ? null : <span className="sr-only">, {artist.y0}</span>}
      </Link>
    </li>
  );
}

/** The map, for a container 60rem wide or more: time from left to right. */
function Timeline({ card, layout }: { card: MusilogyCard; layout: TimelineLayout }) {
  const { height, axisY, ticks, span, placed } = layout;
  const chronological = [...placed].sort(
    (a, b) => (a.artist.y0 as number) - (b.artist.y0 as number)
  );
  return (
    <div className="reveal relative" style={{ height }}>
      {ticks.map((tick) => (
        <span key={tick.year} aria-hidden="true">
          <span
            className="bg-border absolute top-0 w-px"
            style={{ left: percent(tick.x), bottom: AXIS_LABELS }}
          />
          <span
            className="text-text-muted text-caption absolute bottom-0 -translate-x-1/2 font-mono"
            style={{ left: percent(tick.x) }}
          >
            {tick.year}
          </span>
        </span>
      ))}
      <span
        aria-hidden="true"
        className="bg-accent absolute h-2 -translate-y-1/2 rounded-full"
        style={{ left: percent(span.x0), width: percent(span.x1 - span.x0), top: axisY }}
      />
      <span
        aria-hidden="true"
        className={cn(LABEL, 'bg-surface px-1 font-semibold')}
        style={{
          top: axisY,
          ...(span.anchor === 'start'
            ? { left: `calc(${percent(span.x1)} + ${GAP - 4}px)` }
            : { right: `calc(${100 - (span.x0 / WIDTH) * 100}% + ${GAP - 4}px)` }),
        }}
      >
        {card.name}
      </span>
      <ol className="m-0 list-none p-0">
        {chronological.map((one) => (
          <Pin key={one.artist.mbid} placed={one} axisY={axisY} />
        ))}
      </ol>
    </div>
  );
}

/** The same neighbours for a narrower container: one row each, from the oldest start. */
function TimeList({ card, shown }: { card: MusilogyCard; shown: readonly Close[] }) {
  const rows: Array<Close | 'self'> = [...shown]
    .sort((a, b) => (a.artist.y0 ?? Infinity) - (b.artist.y0 ?? Infinity))
    .flatMap((close, i, sorted) => {
      const previous = i === 0 ? -Infinity : (sorted[i - 1]?.artist.y0 ?? Infinity);
      const year = close.artist.y0 ?? Infinity;
      // The artist itself, where its start falls among them.
      return card.y0 !== null && previous <= card.y0 && card.y0 < year ? ['self', close] : [close];
    });
  if (card.y0 !== null && !rows.includes('self')) rows.push('self');
  // An end read from the last album is not one the artist declared.
  const end = card.ended && card.yEndSource === 'declared' ? card.yEnd : null;

  return (
    <ol className="m-0 list-none p-0">
      {rows.map((row) =>
        row === 'self' ? (
          <li
            key="self"
            className="border-accent bg-surface-raised reveal grid min-h-11 grid-cols-[3.5rem_minmax(0,1fr)] items-center gap-x-4 border-l-4 py-2 pl-2"
          >
            <span className="text-ui font-mono tabular-nums">{card.y0}</span>
            <span className="text-row truncate">
              {card.name}
              {end && end !== card.y0 ? (
                <span className="text-ui text-text-muted font-mono"> – {end}</span>
              ) : null}
            </span>
          </li>
        ) : (
          <li
            key={row.artist.mbid}
            className="border-border reveal relative grid min-h-11 grid-cols-[3.5rem_minmax(0,1fr)] items-center gap-x-4 border-b py-2 pl-3"
          >
            <span className="text-ui text-text-muted font-mono tabular-nums">
              {row.artist.y0 ?? '—'}
            </span>
            <span className="flex min-w-0 flex-col">
              <Link
                to={pagePathOf(row.artist)}
                state={DISCOVERY}
                className={cn(
                  ARTIST_LINK,
                  "text-row self-start truncate underline-offset-4 after:absolute after:inset-0 after:content-['']"
                )}
              >
                {row.artist.name}
              </Link>
              {row.mark ? (
                <span className="text-ui text-text-muted">{MARK_LABELS[row.mark]()}</span>
              ) : null}
            </span>
          </li>
        )
      )}
    </ol>
  );
}

/**
 * The artist's close neighbours in time: a map where its container is wide, a list where it is
 * not, both from the same few closest, ten more on demand. A neighbour whose start is unknown
 * has no place on the map: it closes the list, and on the map a line under the axis names it.
 */
export function MusilogyMap({ artist, thisYear }: { artist: MusilogyArtist; thisYear: number }) {
  const all = closestOf(artist);
  const [count, setCount] = useState(FIRST_SHOWN);
  const shown = all.slice(0, count);
  const layout = layoutTimeline(artist.card, shown, thisYear);
  const undated = shown.filter((close) => close.artist.y0 === null);
  const more = Math.min(all.length, MOST) - shown.length;
  if (shown.length === 0) return null;

  return (
    <div className="@container flex flex-col gap-4">
      {layout ? (
        <div className="hidden @min-[60rem]:flex @min-[60rem]:flex-col @min-[60rem]:gap-4">
          <Timeline card={artist.card} layout={layout} />
          {undated.length > 0 ? (
            <div className="text-ui flex flex-wrap items-center gap-x-6">
              <span className="text-text-muted">{m.musilogy_undated_title()}</span>
              <ul className="m-0 contents list-none p-0">
                {undated.map((close) => (
                  <li key={close.artist.mbid} className="inline-flex min-h-11 items-center">
                    <Link
                      to={pagePathOf(close.artist)}
                      state={DISCOVERY}
                      className={cn(ARTIST_LINK, 'underline-offset-4')}
                    >
                      {close.artist.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
      <div className={cn('max-w-prose', layout && '@min-[60rem]:hidden')}>
        <TimeList card={artist.card} shown={shown} />
      </div>
      {more > 0 ? (
        <button
          type="button"
          onClick={() => setCount((n) => n + STEP)}
          className={cn(TEXT_ACTION, 'self-start')}
        >
          {m.musilogy_show_more({ count: String(Math.min(more, STEP)) })}
        </button>
      ) : null}
    </div>
  );
}
