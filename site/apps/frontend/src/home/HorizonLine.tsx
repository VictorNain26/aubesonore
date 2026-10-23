import { useEffect, useLayoutEffect, useRef } from 'react';
import { getAnalyser } from '../lib/player';
import { AMPLITUDE, LAYERS, QUIET, waveY, type Bands } from '../design/wave';

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

/** Seconds for amplitude and speed to cover about two thirds of a change. */
const EASE_SECONDS = 0.6;

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
  /** The full trace alone (the player bar's edge), or with its echo (the horizon). */
  traces?: 1 | 2;
  /** The colour token the line is drawn in. */
  ink?: 'text' | 'dawn';
  /** Peak offset at rest, as a share of the canvas height; live, it swells as AMPLITUDE does. */
  amplitude?: number;
}

export function HorizonLine({
  isPlaying,
  className,
  traces = 2,
  ink: inkToken = 'text',
  amplitude = AMPLITUDE.rest,
}: HorizonLineProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isPlayingRef = useRef(isPlaying);

  useLayoutEffect(() => {
    isPlayingRef.current = isPlaying;
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    // The ink follows the device's day or night: read again, and drawn at once, when it turns.
    // The semantic token itself (--text, --dawn): the theme emits a --color-* only where a
    // stylesheet reads it.
    const dark = window.matchMedia('(prefers-color-scheme: dark)');
    const readInk = () =>
      getComputedStyle(document.documentElement).getPropertyValue(`--${inkToken}`).trim();
    let ink = readInk();
    let motion: WaveMotion = {
      liveness: isPlayingRef.current ? 1 : 0,
      drift: LAYERS.map(() => 0),
      bands: QUIET,
    };
    let frequencies: Uint8Array<ArrayBuffer> | null = null;
    let gain: Gain | null = null;
    const horizon = canvas.closest<HTMLElement>('[data-horizon]');
    let frame = 0;
    let looping = false;
    let onScreen = true;
    let lastTime = performance.now();
    let dpr = 1;

    const paint = (now: number): void => {
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
      const step = 4 * dpr;

      ctx.clearRect(0, 0, width, height);
      LAYERS.slice(0, traces).forEach((layer, i) => {
        const wave = {
          width,
          height,
          amplitude: height * amplitude,
          liveness: motion.liveness,
          layer: i,
          drift: motion.drift[i] ?? 0,
          bands: motion.bands,
        };
        ctx.beginPath();
        for (let x = 0; x <= width + step; x += step) {
          const y = waveY(x, wave);
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.lineWidth = layer.width * dpr;
        ctx.lineJoin = 'round';
        ctx.strokeStyle = `color-mix(in srgb, ${ink} ${Math.round(layer.alpha * 100)}%, transparent)`;
        ctx.stroke();
      });
    };

    const loop = (now: number): void => {
      paint(now);
      frame = requestAnimationFrame(loop);
    };

    // The line moves only where it is seen: on screen, in a visible tab, with motion allowed.
    // Otherwise it rests on its last frame, and under reduced motion it is drawn once, still.
    const sync = (): void => {
      const moving = onScreen && !document.hidden && !reducedMotion.matches;
      if (moving && !looping) {
        looping = true;
        lastTime = performance.now();
        frame = requestAnimationFrame(loop);
      } else if (!moving && looping) {
        looping = false;
        cancelAnimationFrame(frame);
      }
      if (reducedMotion.matches) paint(performance.now());
    };

    // Drawn in device pixels so the stroke stays crisp on dense screens. A new size clears the
    // canvas: the line is drawn again at once, moving or not, never left blank until a frame.
    const resize = () => {
      dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.round(canvas.clientWidth * dpr));
      canvas.height = Math.max(1, Math.round(canvas.clientHeight * dpr));
    };
    resize();
    const resizeObserver = new ResizeObserver(() => {
      resize();
      paint(performance.now());
    });
    resizeObserver.observe(canvas);
    const intersectionObserver = new IntersectionObserver(([entry]) => {
      onScreen = entry?.isIntersecting ?? true;
      sync();
    });
    intersectionObserver.observe(canvas);
    document.addEventListener('visibilitychange', sync);
    reducedMotion.addEventListener('change', sync);
    const turn = (): void => {
      ink = readInk();
      paint(performance.now());
    };
    dark.addEventListener('change', turn);
    sync();
    // The entrance reveals the line from 0.3 s (draw-in, tokens.css), while the first frame can
    // come long after, once the page has hydrated: drawn now, the reveal never uncovers an
    // empty canvas. Under reduced motion, sync has drawn it.
    if (!reducedMotion.matches) paint(performance.now());

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      document.removeEventListener('visibilitychange', sync);
      reducedMotion.removeEventListener('change', sync);
      dark.removeEventListener('change', turn);
    };
  }, [traces, inkToken, amplitude]);

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />;
}
