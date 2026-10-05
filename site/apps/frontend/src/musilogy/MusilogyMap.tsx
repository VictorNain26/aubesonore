import { useEffect, useRef } from 'react';
import { Link } from 'react-router';
import type { MusilogyArtist, MusilogyNeighbour } from '@aubesonore/shared-types/client';
import { DISCOVERY } from '../lib/discoveryTrail';
import { pagePathOf } from '../lib/musilogy';

// Drawing units of the viewBox; the SVG scales to its column.
const WIDTH = 960;
const PAD = 24;
const ROW = 26;
const ROWS = 6;
// The closest neighbours only: the lists below hold every one.
const SHOWN = 40;
// Labels are set in the monospaced face at FONT units, so their width is
// known: Geist Mono's advance is 0.6 em.
const FONT = 12;
const CHAR = FONT * 0.6;

export interface PlacedNeighbour {
  neighbour: MusilogyNeighbour;
  x: number;
  y: number;
  anchor: 'start' | 'end';
}

export interface MapLayout {
  height: number;
  axisY: number;
  ticks: Array<{ year: number; x: number }>;
  center: { x0: number; x1: number; labelX: number; anchor: 'start' | 'end' };
  placed: PlacedNeighbour[];
}

/**
 * Where everything sits: time runs left to right, the artist spans its years
 * on the axis, each close neighbour stands at the year it started, the
 * closest on the rows nearest the axis. A neighbour whose label finds no free
 * row is left to the lists. Null without a start year to place the artist.
 */
export function layoutMap(artist: MusilogyArtist, thisYear: number): MapLayout | null {
  const { card, neighbours } = artist;
  if (card.y0 === null || neighbours === null) return null;

  const close = [...neighbours.before, ...neighbours.during, ...neighbours.after]
    .filter((n): n is MusilogyNeighbour & { y0: number } => n.y0 !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, SHOWN);
  if (close.length === 0) return null;

  const end = card.yEnd ?? (card.ended ? card.y0 : thisYear);
  const years = [card.y0, end, ...close.map((n) => n.y0)];
  const from = Math.floor((Math.min(...years) - 2) / 10) * 10;
  const to = Math.ceil((Math.max(...years) + 2) / 10) * 10;
  const x = (year: number) => PAD + ((year - from) / (to - from)) * (WIDTH - 2 * PAD);

  const axisY = PAD + ROWS * ROW;
  // A label starts 8 units past its point, or ends 8 units before it near the right edge.
  const label = (at: number, name: string) => {
    const width = name.length * CHAR + 16;
    const anchor: 'start' | 'end' = at + width > WIDTH - PAD ? 'end' : 'start';
    const span: [number, number] = anchor === 'start' ? [at, at + width] : [at - width, at];
    return { anchor, span };
  };

  // The artist's own name ends its span, on the axis row that no neighbour takes.
  const x0 = x(card.y0);
  const x1 = Math.max(x(end), x0 + 4);
  const own = label(x1, card.name);

  const order = Array.from({ length: ROWS }, (_, i) => [i + 1, -(i + 1)]).flat();
  const taken = new Map<number, Array<[number, number]>>();
  const placed: PlacedNeighbour[] = [];
  for (const neighbour of close) {
    const at = x(neighbour.y0);
    const { anchor, span } = label(at, neighbour.name);
    const row = order.find((r) =>
      (taken.get(r) ?? []).every(([a, b]) => span[1] < a || span[0] > b)
    );
    if (row === undefined) continue;
    taken.set(row, [...(taken.get(row) ?? []), span]);
    placed.push({ neighbour, x: at, y: axisY + row * ROW, anchor });
  }

  const ticks = [];
  for (let year = from; year <= to; year += 10) ticks.push({ year, x: x(year) });

  return {
    height: axisY * 2 + PAD,
    axisY,
    ticks,
    center: { x0, x1, labelX: own.anchor === 'start' ? x1 + 8 : x0 - 8, anchor: own.anchor },
    placed,
  };
}

/**
 * The map of an artist's neighbourhood in time. It repeats the lists below,
 * which are what screen readers read: the drawing is hidden from them.
 */
export function MusilogyMap({ artist, thisYear }: { artist: MusilogyArtist; thisYear: number }) {
  const layout = layoutMap(artist, thisYear);
  const scroller = useRef<HTMLDivElement>(null);
  const centerAt = layout ? layout.center.x0 / WIDTH : 0;

  // On a narrow screen the map scrolls sideways: open it on the artist, not on its first decade.
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = Math.max(0, centerAt * el.scrollWidth - el.clientWidth / 3);
  }, [centerAt]);

  if (!layout) return null;
  const { height, axisY, ticks, center, placed } = layout;

  return (
    <div ref={scroller} className="reveal overflow-x-auto">
      <svg
        viewBox={`0 0 ${WIDTH} ${height}`}
        aria-hidden="true"
        fontSize={FONT}
        className="w-full min-w-240 font-mono"
      >
        {ticks.map((tick) => (
          <g key={tick.year} className="text-border">
            <line x1={tick.x} x2={tick.x} y1={PAD} y2={height - PAD} stroke="currentColor" />
            <text
              x={tick.x}
              y={height - 6}
              textAnchor="middle"
              className="text-text-muted"
              fill="currentColor"
            >
              {tick.year}
            </text>
          </g>
        ))}

        {placed.map(({ neighbour, x, y, anchor }) => (
          <Link
            key={neighbour.mbid}
            to={pagePathOf(neighbour)}
            state={DISCOVERY}
            tabIndex={-1}
            className="ease-out-quart transition-opacity duration-150 hover:opacity-60"
          >
            <line x1={x} x2={x} y1={y} y2={axisY} stroke="currentColor" className="text-border" />
            <circle cx={x} cy={y} r={4} fill="currentColor" className="text-text-muted" />
            <text
              x={anchor === 'start' ? x + 8 : x - 8}
              y={y + 4}
              textAnchor={anchor}
              fill="currentColor"
              className={neighbour.played ? 'text-text font-semibold' : 'text-text'}
            >
              {neighbour.name}
            </text>
          </Link>
        ))}

        <rect
          x={center.x0}
          y={axisY - 4}
          width={center.x1 - center.x0}
          height={8}
          rx={4}
          fill="currentColor"
          className="text-accent"
        />
        <text
          x={center.labelX}
          y={axisY + 4}
          textAnchor={center.anchor}
          fill="currentColor"
          className="text-text font-semibold"
        >
          {artist.card.name}
        </text>
      </svg>
    </div>
  );
}
