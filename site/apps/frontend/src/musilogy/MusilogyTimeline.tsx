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
 * From the decade the first span starts in to this year, which closes the axis as « today » rather
 * than a year still to come. A label every ten years, twenty past sixty, forty past a hundred and
 * twenty, none past 62 % of the axis: « aujourd'hui » is 97 px wide and the narrowest wide track 352
 * px, so it begins at 72 %, and a year label centred at 62 % ends 18 px earlier (Tim Hecker's 2010
 * sat on it, 2026-10-12). Phones keep fewer (tickClass).
 */
export function axisOf(spans: readonly Span[], thisYear: number): Axis | null {
  if (spans.length === 0) return null;
  const from = Math.floor(Math.min(...spans.map((span) => span.from)) / 10) * 10;
  const to = Math.max(thisYear, ...spans.map((span) => span.to));
  const step = to - from > 120 ? 40 : to - from > 60 ? 20 : 10;
  const ticks: number[] = [];
  for (let year = Math.ceil(from / step) * step; year <= from + (to - from) * 0.62; year += step) {
    ticks.push(year);
  }
  return { from, to, ticks };
}

/** Where a year falls on the axis, in percent of its width. */
function at(year: number, axis: Axis): number {
  return ((year - axis.from) / (axis.to - axis.from)) * 100;
}

function placed(span: Span, axis: Axis): CSSProperties {
  const width = axis.to - axis.from;
  return {
    left: `${at(span.from, axis)}%`,
    width: `${(Math.max(span.to - span.from, 1) / width) * 100}%`,
  };
}

type Years = Pick<MusilogyNeighbour, 'y0' | 'yEnd' | 'ended'>;

export interface BarLabel {
  text: string;
  /** Percent of the axis. */
  at: number;
  /** Which side of the label sits on `at`: its start (it reads rightwards) or its end. */
  align: 'start' | 'end';
}

// Two four-digit labels need about 78 px side by side: 26 % of the narrowest track (298 px on a
// 390 px phone).
const PAIR_ROOM = 26;
// A label beginning past this point would run off the track's end, so it ends there instead.
const LAST_START = 74;

/**
 * The years written on a bar, always in view (direct labelling: Datawrapper, data.europa.eu):
 * its start at its left end and its declared end at its right end; one « 1971–1975 » when both
 * would meet; the start alone while it runs to today, where the axis says « aujourd'hui ».
 */
export function barLabelsOf(artist: Years, axis: Axis): BarLabel[] {
  if (artist.y0 === null) return [];
  const start = at(artist.y0, axis);
  const alone = (text: string): BarLabel[] =>
    start > LAST_START ? [{ text, at: 100, align: 'end' }] : [{ text, at: start, align: 'start' }];
  if (!artist.ended) return alone(String(artist.y0));
  if (artist.yEnd === null) return alone(m.musilogy_end_unknown({ y0: String(artist.y0) }));
  if (artist.yEnd === artist.y0) return alone(String(artist.y0));
  const end = at(artist.yEnd, axis);
  if (end - start < PAIR_ROOM) {
    const both = `${artist.y0}–${artist.yEnd}`;
    return start > LAST_START
      ? [{ text: both, at: end, align: 'end' }]
      : [{ text: both, at: start, align: 'start' }];
  }
  return [
    { text: String(artist.y0), at: start, align: 'start' },
    { text: String(artist.yEnd), at: end, align: 'end' },
  ];
}

// The halo's padding (px-1) shifted back, so the year itself starts or ends where the bar does.
function labelStyle(label: BarLabel): CSSProperties {
  return {
    left: `${label.at}%`,
    transform: label.align === 'end' ? 'translateX(calc(-100% + 0.25rem))' : 'translateX(-0.25rem)',
  };
}

/** An artist's years, in words: what the bar draws, for a screen reader. */
export function yearsOf(artist: Years): string {
  if (artist.y0 === null) return m.musilogy_start_unknown();
  if (!artist.ended) return m.artist_since({ year: String(artist.y0) });
  // Ended without a declared end: a year alone would read as a one-year career.
  if (artist.yEnd === null) return m.musilogy_end_unknown({ y0: String(artist.y0) });
  return artist.yEnd !== artist.y0
    ? m.years_range({ from: String(artist.y0), to: String(artist.yEnd) })
    : String(artist.y0);
}

/** The intro: the sound they share. */
export function timelineNote(artist: MusilogyArtist): string {
  const shared = sharedTerm(closeArtistsOf(artist));
  return shared ? m.musilogy_close_shared({ term: shared }) : m.musilogy_close_same();
}

// The columns: the rank, the name, the years drawn, which take all the room the name leaves. On a
// narrow container the drawing takes a line of its own under the name.
const COLUMNS =
  'grid-cols-[2rem_minmax(0,1fr)] gap-x-3 @min-[44rem]:grid-cols-[2.5rem_minmax(0,17rem)_minmax(0,1fr)] @min-[44rem]:gap-x-5';
const ROW = cn('grid', COLUMNS);
// Clicks pass through to the row's link: the drawing is the row, not a control. The years on top,
// the bar under them.
const TRACK =
  'pointer-events-none relative col-start-2 h-9 @min-[44rem]:col-start-3 @min-[44rem]:row-start-1';
const BAR = 'absolute top-6 rounded-full';
// On the page's colour, so no line runs through a year: a label's halo.
const LABEL =
  'text-label bg-surface absolute top-0 px-1 font-mono leading-4 whitespace-nowrap tabular-nums';
// The decades: very light lines (Few, « Grid Lines in Graphs are Rarely Useful »: useful where the
// rows run far from the scale). The artist's own start and end: darker, over them (Datawrapper,
// « Range highlights and lines »; Wikipedia's band-member timelines draw their marks so).
const GRID = 'bg-text-muted/15 absolute inset-y-0 w-px';
const MARK = 'bg-accent/40 absolute inset-y-0 w-px';

/** The lines every row reads against: the decades, and the artist's own start and end. */
function Lines({ axis, own, className }: { axis: Axis; own: Span | null; className?: string }) {
  return (
    <>
      {axis.ticks.map((year) => (
        <span key={year} className={cn(GRID, className)} style={{ left: `${at(year, axis)}%` }} />
      ))}
      {own ? (
        <span className={cn(MARK, className)} style={{ left: `${at(own.from, axis)}%` }} />
      ) : null}
      {own && own.to < axis.to ? (
        <span className={cn(MARK, className)} style={{ left: `${at(own.to, axis)}%` }} />
      ) : null}
    </>
  );
}

/**
 * On a phone (a track of 298 px at 390), every other label when they would stand closer than 20 %
 * of the track (60 px), and none past 55 %: « aujourd'hui » begins at 67 % (data.europa.eu,
 * « Responsiveness »: fewer axis labels on small displays, never rotated).
 */
function tickClass(axis: Axis, index: number): string {
  const first = axis.ticks[0] ?? axis.from;
  const step = axis.ticks.length > 1 ? at(axis.ticks[1] ?? first, axis) - at(first, axis) : 100;
  const year = axis.ticks[index] ?? axis.to;
  return (step < 20 && index % 2 === 1) || at(year, axis) > 55 ? '@max-[44rem]:hidden' : '';
}

/** A row's drawing: the lines on a phone, the bar, and its years written on it. */
function Drawing({
  years,
  axis,
  own,
  bar,
  label,
  thisYear,
}: {
  years: Years;
  axis: Axis;
  thisYear: number;
  own: Span | null;
  bar: string;
  label: string;
}) {
  const span = spanOf(years.y0, years.yEnd, years.ended, thisYear);
  return (
    <span aria-hidden="true" className={TRACK}>
      <Lines axis={axis} own={own} className="@min-[44rem]:hidden" />
      {span ? <span className={cn(BAR, bar)} style={placed(span, axis)} /> : null}
      {barLabelsOf(years, axis).map((one) => (
        <span key={one.text} className={cn(LABEL, label)} style={labelStyle(one)}>
          {one.text}
        </span>
      ))}
    </span>
  );
}

/**
 * The close artists of an artist, the closest first, each with its years drawn on one axis shared
 * by all and written on its bar (docs/vision.md §2.4): who came before, alongside and after reads at
 * a glance, without grouping them by decade. The artist itself leads, its bar in ink and the others
 * grey (Datawrapper, « Emphasize with color »: grey everything but what matters), its start and end
 * drawn as lines through the rows.
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
  const ownYears: Years = {
    y0: card.y0,
    yEnd: card.yEndSource === 'declared' ? card.yEnd : null,
    ended: card.ended === true,
  };
  const own = spanOf(ownYears.y0, ownYears.yEnd, ownYears.ended, thisYear);
  const axis = axisOf(
    [...close.map((n) => spanOf(n.y0, n.yEnd, n.ended, thisYear)), own].filter(
      (span): span is Span => span !== null
    ),
    thisYear
  );

  return (
    <div className="@container">
      {axis ? (
        // The decades stay in view while the rows go by, under the header when it is back.
        <div
          aria-hidden="true"
          className={cn(ROW, 'bg-surface top-header border-accent sticky z-10 border-b pt-2 pb-2')}
        >
          <span className="relative col-start-2 h-4 @min-[44rem]:col-start-3">
            {axis.ticks.map((year, index) => (
              <span
                key={year}
                // Centred on its year; the first one may reach into the empty rank column.
                className={cn(
                  'text-label text-text-muted absolute -translate-x-1/2 font-mono leading-4 tabular-nums',
                  tickClass(axis, index)
                )}
                style={{ left: `${at(year, axis)}%` }}
              >
                {year}
              </span>
            ))}
            <span className="text-label text-text-muted absolute right-0 font-mono leading-4">
              {m.musilogy_today()}
            </span>
          </span>
        </div>
      ) : null}
      <div className="relative">
        {axis ? (
          // Wide, the lines run once through every row; narrow, each drawing has its own, so no
          // line crosses a name.
          <div
            aria-hidden="true"
            className={cn('pointer-events-none absolute inset-0 hidden @min-[44rem]:grid', COLUMNS)}
          >
            <span className="relative col-start-3">
              <Lines axis={axis} own={own} />
            </span>
          </div>
        ) : null}
        {own && axis ? (
          <div className={cn(ROW, 'border-border relative items-center border-b py-3')}>
            <span aria-hidden="true" />
            <span className="flex min-w-0 flex-col">
              <span className="text-row font-semibold">{card.name}</span>
              <span className="sr-only">{yearsOf(ownYears)}</span>
            </span>
            <Drawing
              years={ownYears}
              axis={axis}
              own={own}
              thisYear={thisYear}
              bar="bg-accent h-2.5"
              label="text-text font-semibold"
            />
          </div>
        ) : null}
        <ol className="relative m-0 list-none p-0">
          {close.map((neighbour) => {
            const differs = shared !== null && termOf(neighbour) !== shared;
            const note = [
              neighbour.y0 === null ? m.musilogy_start_unknown() : null,
              shared === null || differs ? termOf(neighbour) : null,
            ].filter(Boolean);
            return (
              <li
                key={neighbour.mbid}
                className={cn(
                  ROW,
                  'group border-border reveal-early relative items-center border-b py-3'
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
                  {neighbour.y0 !== null ? (
                    <span className="sr-only">{yearsOf(neighbour)}</span>
                  ) : null}
                  {note.length > 0 ? (
                    <span className="text-sub text-text-muted">{note.join(' · ')}</span>
                  ) : null}
                </span>
                {axis ? (
                  <Drawing
                    years={neighbour}
                    axis={axis}
                    own={own}
                    thisYear={thisYear}
                    bar="bg-text-muted/55 group-hover:bg-text-muted group-focus-within:bg-text-muted h-1.5 transition-colors duration-200"
                    label="text-text-muted group-hover:text-text group-focus-within:text-text transition-colors duration-200"
                  />
                ) : null}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
