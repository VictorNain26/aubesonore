import { useEffect, useLayoutEffect, useRef } from 'react';
import { getAnalyser } from '../lib/player';

// ─────────────────────────────────────────────
// The horizon line: two traces drifting against each other, each a sum of
// three sines. At rest they barely ripple and drift slowly; while the live
// plays they swell and speed up. Amplitude and speed ease between the two, so
// pressing Écouter never makes the line jump.
//
// While it plays, the line listens: each of the three sines follows a band
// of the stream (its widest swell the bass, the finest the treble) and the
// whole line breathes with the energy; the bass also beats the "now" dot
// through `--bass` on the horizon. On iOS the stream stays off Web Audio
// (lib/player.ts): the bands rest at their middle and the line is the
// mockup's alone.
//
// One period spans the visible width, so the drift loops seamlessly. The rAF
// loop lives in the canvas: a frame never re-renders the React tree, and
// `isPlaying` is read from a ref so a change does not restart the loop.
// ─────────────────────────────────────────────

type Sine = readonly [harmonic: number, weight: number, phase: number];

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

/** Peak offset as a share of the canvas height, at rest and while playing. */
export const AMPLITUDE = { rest: 5 / 120, live: 30 / 120 };

/** Seconds for amplitude and speed to cover about two thirds of a change. */
const EASE_SECONDS = 0.6;

/** Loudness of the stream in three bands, 0..1. */
export type Bands = readonly [bass: number, mid: number, treble: number];

/** Where the bands sit when nothing is heard: the line is then the mockup's. */
export const QUIET: Bands = [0.5, 0.5, 0.5];

const BAND_HZ = [250, 2000, 8000] as const;
/** Bands rise fast and fall slowly, like a meter, so the line follows beats without jitter. */
const ATTACK_SECONDS = 0.06;
const RELEASE_SECONDS = 0.35;

/** Mean level of each band (bass up to 250 Hz, mid to 2 kHz, treble to 8 kHz), 0..1. */
export function bandsOf(frequencies: Uint8Array, sampleRate: number): Bands {
  const binHz = sampleRate / (2 * frequencies.length);
  const levels = [0, 0, 0];
  const counts = [0, 0, 0];
  frequencies.forEach((value, bin) => {
    const band = BAND_HZ.findIndex((top) => (bin + 0.5) * binHz <= top);
    if (band === -1) return;
    levels[band] = (levels[band] ?? 0) + value / 255;
    counts[band] = (counts[band] ?? 0) + 1;
  });
  return [0, 1, 2].map((b) => ((counts[b] ?? 0) ? (levels[b] ?? 0) / (counts[b] ?? 1) : 0.5)) as [
    number,
    number,
    number,
  ];
}

/** Recent floor and ceiling of each band: the auto gain of a meter. */
export interface Gain {
  floor: Bands;
  ceiling: Bands;
}

/** Seconds for floor and ceiling to relax towards the level; a smaller span is not stretched. */
const GAIN_SECONDS = 4;
const MIN_SPAN = 0.08;

/**
 * Raw levels hardly move (the bass of most mixes sits near full scale): each band is read
 * between its recent floor and ceiling instead, which follow a new extreme at once and relax
 * over a few seconds, so beats stand out whatever the mix.
 */
export function autoGain(gain: Gain | null, raw: Bands, dt: number): { gain: Gain; bands: Bands } {
  const relax = 1 - Math.exp(-dt / GAIN_SECONDS);
  const floor = raw.map((level, k) => {
    const f = gain?.floor[k] ?? level;
    return Math.min(level, f + (level - f) * relax);
  }) as unknown as Bands;
  const ceiling = raw.map((level, k) => {
    const c = gain?.ceiling[k] ?? level;
    return Math.max(level, c + (level - c) * relax);
  }) as unknown as Bands;
  const bands = raw.map((level, k) => {
    const span = Math.max((ceiling[k] ?? 1) - (floor[k] ?? 0), MIN_SPAN);
    return Math.min(1, Math.max(0, (level - (floor[k] ?? 0)) / span));
  }) as unknown as Bands;
  return { gain: { floor, ceiling }, bands };
}

/** Signed offset of a trace (about -1.6..1.6) at `u`, a position in widths; each sine is
 *  scaled by its band, from 0.4 (silent) to 1.6 (loudest); 0.5 leaves it as drawn. */
export function traceOffset(sines: readonly Sine[], u: number, bands: Bands = QUIET): number {
  return sines.reduce(
    (y, [n, w, p], k) =>
      y + w * (0.4 + 1.2 * (bands[k] ?? 0.5)) * Math.sin(2 * Math.PI * n * u + p),
    0
  );
}

export interface WaveMotion {
  /** Eased 0 (rest) .. 1 (live). */
  liveness: number;
  /** Drift of each layer, in widths. */
  drift: number[];
  /** Followed bands of the stream. */
  bands: Bands;
}

/** Advances the motion by `dt` seconds towards rest or live, the bands towards `heard`. */
export function stepMotion(
  motion: WaveMotion,
  isPlaying: boolean,
  dt: number,
  heard: Bands = QUIET
): WaveMotion {
  const target = isPlaying ? 1 : 0;
  const liveness = target + (motion.liveness - target) * Math.exp(-dt / EASE_SECONDS);
  const drift = LAYERS.map((layer, i) => {
    const period = layer.period.rest + (layer.period.live - layer.period.rest) * liveness;
    return ((motion.drift[i] ?? 0) + (layer.direction * dt) / period) % 1;
  });
  const bands = motion.bands.map((level, k) => {
    const goal = heard[k] ?? 0.5;
    const tau = goal > level ? ATTACK_SECONDS : RELEASE_SECONDS;
    return goal + (level - goal) * Math.exp(-dt / tau);
  }) as unknown as Bands;
  return { liveness, drift, bands };
}

interface HorizonLineProps {
  isPlaying: boolean;
  className?: string;
}

export function HorizonLine({ isPlaying, className }: HorizonLineProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isPlayingRef = useRef(isPlaying);

  useLayoutEffect(() => {
    isPlayingRef.current = isPlaying;
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    // Drawn in device pixels so the stroke stays crisp on dense screens.
    let dpr = 1;
    const resize = () => {
      dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.round(canvas.clientWidth * dpr));
      canvas.height = Math.max(1, Math.round(canvas.clientHeight * dpr));
    };
    resize();
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const ink = getComputedStyle(document.documentElement).getPropertyValue('--color-text').trim();
    let motion: WaveMotion = {
      liveness: isPlayingRef.current ? 1 : 0,
      drift: LAYERS.map(() => 0),
      bands: QUIET,
    };
    let frequencies: Uint8Array<ArrayBuffer> | null = null;
    let gain: Gain | null = null;
    const horizon = canvas.closest<HTMLElement>('[data-horizon]');
    let frame = 0;
    let lastTime = performance.now();

    const draw = (now: number): void => {
      const dt = Math.min((now - lastTime) / 1000, 0.1);
      lastTime = now;
      // Reduced motion: a still line at rest.
      if (!reducedMotion.matches) {
        const analyser = isPlayingRef.current ? getAnalyser() : null;
        let heard = QUIET;
        if (analyser) {
          frequencies ??= new Uint8Array(analyser.frequencyBinCount);
          analyser.getByteFrequencyData(frequencies);
          const read = autoGain(gain, bandsOf(frequencies, analyser.context.sampleRate), dt);
          gain = read.gain;
          heard = read.bands;
        }
        motion = stepMotion(motion, isPlayingRef.current, dt, heard);
        // The dot beats with the bass only while it is heard: 0 when quiet.
        horizon?.style.setProperty('--bass', String(analyser ? motion.bands[0] : 0));
      }

      const { width, height } = canvas;
      const mid = height / 2;
      const amplitude =
        height * (AMPLITUDE.rest + (AMPLITUDE.live - AMPLITUDE.rest) * motion.liveness);
      const step = 4 * dpr;

      ctx.clearRect(0, 0, width, height);
      LAYERS.forEach((layer, i) => {
        const drift = motion.drift[i] ?? 0;
        ctx.beginPath();
        for (let x = 0; x <= width + step; x += step) {
          const y =
            mid +
            amplitude * layer.gain * traceOffset(layer.sines, x / width + drift, motion.bands);
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.lineWidth = layer.width * dpr;
        ctx.lineJoin = 'round';
        ctx.strokeStyle = `color-mix(in srgb, ${ink} ${Math.round(layer.alpha * 100)}%, transparent)`;
        ctx.stroke();
      });

      frame = requestAnimationFrame(draw);
    };

    const handleVisibility = () => {
      cancelAnimationFrame(frame);
      if (!document.hidden) {
        lastTime = performance.now();
        frame = requestAnimationFrame(draw);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    frame = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />;
}
