// ─────────────────────────────────────────────
// The line: the one drawing of every wave on the site. Two traces, each a sum of three sines
// (harmonics 2/5/11 and 3/7/13), the first full, the second an echo. The home page's horizon
// moves them with the stream (HorizonLine); everything else draws them still: the calm rule
// between rows, the player bar's edge, the loader, a missing cover, the 404's silent line and
// each artist's own horizon, seeded by its id.
//
// Every harmonic is a whole number of turns per width, so a line meets itself at its two ends:
// a tile of it repeats without a seam (the rule's mask) and the drift loops.
// Pure functions only: no window, no document, so the server renders every wave.
// ─────────────────────────────────────────────

export type Sine = readonly [harmonic: number, weight: number, phase: number];

export interface WaveLayer {
  sines: readonly Sine[];
  /** Share of the common amplitude this trace gets. */
  gain: number;
  /** Seconds to drift one width, at rest and while playing. */
  period: { rest: number; live: number };
  /** 1 drifts left, -1 drifts right. */
  direction: 1 | -1;
  /** Ink opacity and stroke width (CSS px). */
  alpha: number;
  width: number;
}

export const LAYERS: readonly WaveLayer[] = [
  {
    sines: [
      [2, 0.55, 0],
      [5, 0.3, 1.3],
      [11, 0.15, 0.4],
    ],
    gain: 1,
    period: { rest: 28, live: 9 },
    direction: 1,
    alpha: 1,
    width: 1.4,
  },
  {
    sines: [
      [3, 0.5, 2.1],
      [7, 0.35, 0.2],
      [13, 0.15, 1.9],
    ],
    gain: 0.8,
    period: { rest: 36, live: 13 },
    direction: -1,
    alpha: 0.3,
    width: 1,
  },
];

/** Peak offset as a share of the height, at rest and while playing. */
export const AMPLITUDE = { rest: 5 / 120, live: 30 / 120 };

/** Loudness of the stream in three bands, 0..1. */
export type Bands = readonly [bass: number, mid: number, treble: number];

/** Where the bands sit when nothing is heard: the line is then the mockup's. */
export const QUIET: Bands = [0.5, 0.5, 0.5];

/** How far a seed turns each sine's phase: the three sines turn apart, so seeds differ in shape. */
const SEED_TURN = [1, 1.7, 0.6] as const;

/** Signed offset of a trace (about -1.6..1.6, -1..1 when quiet) at `u`, a position in widths;
 *  each sine is scaled by its band, from 0.4 (silent) to 1.6 (loudest); 0.5 leaves it as drawn. */
export function traceOffset(
  sines: readonly Sine[],
  u: number,
  bands: Bands = QUIET,
  seed = 0
): number {
  return sines.reduce(
    (y, [n, w, p], k) =>
      y +
      w *
        (0.4 + 1.2 * (bands[k] ?? 0.5)) *
        Math.sin(2 * Math.PI * n * u + p + seed * (SEED_TURN[k] ?? 1)),
    0
  );
}

export interface WaveOptions {
  width: number;
  height: number;
  /** Peak offset at rest, in the units of `height`. */
  amplitude: number;
  /** 0 (rest) .. 1 (live): the line swells to the live amplitude, AMPLITUDE.live / AMPLITUDE.rest
   *  times the rest one. */
  liveness?: number | undefined;
  /** A phase, 0..2π: the same seed always draws the same line (seedOf turns an id into one). */
  seed?: number | undefined;
  /** Which trace of LAYERS: 0 the full one, 1 the echo. */
  layer?: number;
  /** How far the trace has drifted, in widths. */
  drift?: number;
  bands?: Bands;
  /** 0..1 at `u`, a position in widths: where the line is silenced (0) or full (1). */
  envelope?: ((u: number) => number) | undefined;
}

const SWELL = AMPLITUDE.live / AMPLITUDE.rest - 1;

/** The height of the line at `x`. */
export function waveY(x: number, o: WaveOptions): number {
  const layer = LAYERS[o.layer ?? 0] ?? LAYERS[0]!;
  const u = x / o.width;
  const amplitude = o.amplitude * (1 + SWELL * (o.liveness ?? 0)) * layer.gain;
  const envelope = o.envelope ? o.envelope(u) : 1;
  return (
    o.height / 2 +
    amplitude * envelope * traceOffset(layer.sines, u + (o.drift ?? 0), o.bands, o.seed)
  );
}

/** The line as an SVG path from x = 0 to x = width, a point every `step`. */
export function wavePath(o: WaveOptions & { step?: number }): string {
  const count = Math.max(2, Math.round(o.width / (o.step ?? 4)));
  let d = '';
  for (let i = 0; i <= count; i++) {
    const x = (i / count) * o.width;
    d += `${i === 0 ? 'M' : ' L'}${round(x)} ${round(waveY(x, o))}`;
  }
  return d;
}

const round = (n: number) => String(Math.round(n * 100) / 100);

/** A djb2 hash of a string, as a non-negative integer. */
export function hashOf(seed: string): number {
  let h = 5381;
  for (let i = 0; i < seed.length; i += 1) h = (h * 33) ^ seed.charCodeAt(i);
  return Math.abs(h);
}

/** The phase of an id's own line, 0..2π: the same id always gets the same line. */
export function seedOf(id: string): number {
  return ((hashOf(id) % 6283) / 6283) * 2 * Math.PI;
}

/** The calm rule's tile: 640 by 6 px, a still line 1 px thick. */
export const RULE = { width: 640, height: 6, amplitude: 1.4, seed: 0.9 } as const;

/** The calm rule as a CSS mask: tokens.css draws the rules between rows with it (`--wave-rule`),
 *  in the rule's colour. The test of this module holds the stylesheet to it. */
export function ruleMask(): string {
  const d = wavePath({ ...RULE, step: 6 });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${RULE.width}" height="${RULE.height}" viewBox="0 0 ${RULE.width} ${RULE.height}"><path d="${d}" fill="none" stroke="black" stroke-width="1"/></svg>`;
  return `url('data:image/svg+xml,${encodeURIComponent(svg)}')`;
}
