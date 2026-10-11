import type { CSSProperties } from 'react';
import { Link } from 'react-router';
import type { MusilogyArtist, MusilogyNeighbour } from '@aubesonore/shared-types/client';
import * as m from '@/paraglide/messages.js';
import { cn } from '@/lib/utils';
import { ARTIST_LINK } from '../home/styles';
import { DISCOVERY } from '../lib/discoveryTrail';
import { pagePathOf } from '../lib/musilogy';

// The link covers its whole row: the target is the row, never the name alone.
const STRETCHED = "after:absolute after:inset-0 after:content-['']";

/** The close artists, the closest first: musilogy's rank, ties already settled. */
export function closeArtistsOf({ neighbours }: MusilogyArtist): readonly MusilogyNeighbour[] {
  return neighbours ?? [];
}

/** A style or genre as the page says it: Discogs' « Krautrock » and MusicBrainz' « krautrock » are one. */
export function termOf(artist: MusilogyNeighbour): string {
  return artist.term.toLowerCase();
}

/**
 * The style or genre at least half of the close artists share, said once above them rather than
 * on every row; a tie goes to the closer one. Null when none is shared that widely.
 */
export function sharedTerm(close: readonly MusilogyNeighbour[]): string | null {
  const counts = new Map<string, number>();
  for (const artist of close) counts.set(termOf(artist), (counts.get(termOf(artist)) ?? 0) + 1);
  let best: string | null = null;
  let most = 0;
  for (const [term, count] of counts) {
    if (count > most) {
      best = term;
      most = count;
    }
  }
  return best !== null && most * 2 >= close.length ? best : null;
}

export interface Span {
  from: number;
  to: number;
}

/**
 * The years an artist was active, as far as they are known: to its declared end, to this year
 * while it has not ended, its start alone when it ended without a date. Null without a start.
 */
export function spanOf(
  y0: number | null,
  yEnd: number | null,
  ended: boolean,
  thisYear: number
): Span | null {
  if (y0 === null) return null;
  if (!ended) return { from: y0, to: thisYear };
  return { from: y0, to: yEnd ?? y0 };
}

export interface Axis {
  from: number;
  to: number;
  ticks: number[];
}

/**
 * The decades every span fits in, a label every ten years, twenty past sixty, forty past a
 * hundred and twenty: labels never crowd the narrowest track.
 */
export function axisOf(spans: readonly Span[]): Axis | null {
  if (spans.length === 0) return null;
  const from = Math.floor(Math.min(...spans.map((span) => span.from)) / 10) * 10;
  const to = Math.ceil((Math.max(...spans.map((span) => span.to)) + 1) / 10) * 10;
  const step = to - from > 120 ? 40 : to - from > 60 ? 20 : 10;
  const ticks: number[] = [];
  for (let year = Math.ceil(from / step) * step; year <= to; year += step) ticks.push(year);
  return { from, to, ticks };
}

function placed(span: Span, axis: Axis): CSSProperties {
  const width = axis.to - axis.from;
  return {
    left: `${((span.from - axis.from) / width) * 100}%`,
    width: `${(Math.max(span.to - span.from, 1) / width) * 100}%`,
  };
}

/** A close artist's years, in words: what the bar draws. */
export function yearsOf(artist: MusilogyNeighbour): string {
  if (artist.y0 === null) return m.musilogy_start_unknown();
  if (!artist.ended) return m.artist_since({ year: String(artist.y0) });
  // Ended without a declared end: a year alone would read as a one-year career.
  if (artist.yEnd === null) return m.musilogy_end_unknown({ y0: String(artist.y0) });
  return artist.yEnd !== artist.y0
    ? m.years_range({ from: String(artist.y0), to: String(artist.yEnd) })
    : String(artist.y0);
}

/** The intro: the sound they share, then what the light band marks. */
export function timelineNote(artist: MusilogyArtist, thisYear: number): string {
  const shared = sharedTerm(closeArtistsOf(artist));
  const note = shared ? m.musilogy_close_shared({ term: shared }) : m.musilogy_close_same();
  const { card } = artist;
  const own = spanOf(
    card.y0,
    card.yEndSource === 'declared' ? card.yEnd : null,
    card.ended === true,
    thisYear
  );
  return own ? `${note} ${m.musilogy_close_band({ name: card.name })}` : note;
}

// The columns: the rank, the name and its years, the years drawn. On a narrow container the
// drawing takes a line of its own under the name.
const ROW =
  'grid grid-cols-[2rem_minmax(0,1fr)] gap-x-3 @min-[44rem]:grid-cols-[2.5rem_minmax(0,1fr)_minmax(0,20rem)] @min-[44rem]:gap-x-4';
// Clicks pass through to the row's link: the drawing is the row, not a control.
const TRACK =
  'pointer-events-none relative col-start-2 h-6 @min-[44rem]:col-start-3 @min-[44rem]:row-start-1';

/**
 * The close artists of an artist, the closest first, each with its years drawn on one axis shared
 * by all, the artist's own years a light band behind them (docs/vision.md §2.4): who came before,
 * alongside and after reads at a glance, without grouping them by decade.
 */
export function MusilogyTimeline({
  artist,
  thisYear,
}: {
  artist: MusilogyArtist;
  thisYear: number;
}) {
  const close = closeArtistsOf(artist);
  if (close.length === 0) return null;
  const { card } = artist;
  const shared = sharedTerm(close);
  const own = spanOf(
    card.y0,
    card.yEndSource === 'declared' ? card.yEnd : null,
    card.ended === true,
    thisYear
  );
  const spans = close.map((n) => spanOf(n.y0, n.yEnd, n.ended, thisYear));
  const axis = axisOf([...spans, own].filter((span): span is Span => span !== null));

  return (
    <div className="@container">
      {axis ? (
        <div aria-hidden="true" className={cn(ROW, 'pb-2')}>
          <span className="relative col-start-2 h-5 @min-[44rem]:col-start-3">
            {axis.ticks.map((year) => (
              <span
                key={year}
                className="text-label text-text-muted absolute -translate-x-1/2 font-mono tabular-nums"
                style={{ left: `${((year - axis.from) / (axis.to - axis.from)) * 100}%` }}
              >
                {year}
              </span>
            ))}
          </span>
        </div>
      ) : null}
      <ol className="border-accent m-0 list-none border-t p-0">
        {close.map((neighbour, i) => {
          const span = spans[i] ?? null;
          const differs = shared !== null && termOf(neighbour) !== shared;
          return (
            <li
              key={neighbour.mbid}
              className={cn(
                ROW,
                'group border-border reveal-early ease-out-quart hover:bg-surface-raised focus-within:bg-surface-raised relative min-h-16 items-center border-b py-3 transition-colors duration-200'
              )}
            >
              <span
                aria-hidden="true"
                className="text-ui text-text-muted self-start pt-0.5 font-mono tabular-nums"
              >
                {neighbour.rank}
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <Link
                  to={pagePathOf(neighbour)}
                  state={DISCOVERY}
                  className={cn(ARTIST_LINK, STRETCHED, 'text-row self-start underline-offset-4')}
                >
                  {neighbour.name}
                </Link>
                <span className="text-sub text-text-muted">
                  {yearsOf(neighbour)}
                  {shared === null || differs ? ` · ${termOf(neighbour)}` : null}
                </span>
              </span>
              {axis ? (
                <span aria-hidden="true" className={TRACK}>
                  {own ? (
                    <span
                      className="bg-border group-hover:bg-text-muted/25 group-focus-within:bg-text-muted/25 absolute inset-y-0 transition-colors duration-200"
                      style={placed(own, axis)}
                    />
                  ) : null}
                  {span ? (
                    <span
                      className="bg-text-muted group-hover:bg-text group-focus-within:bg-text absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full transition-colors duration-200"
                      style={placed(span, axis)}
                    />
                  ) : null}
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
