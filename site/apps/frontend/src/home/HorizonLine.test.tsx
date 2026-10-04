// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  HorizonLine,
  LAYERS,
  QUIET,
  autoGain,
  bandsOf,
  type Gain,
  stepMotion,
  traceOffset,
  type Bands,
} from './HorizonLine';

const analyser = { current: null as unknown };
vi.mock('../lib/player', () => ({ getAnalyser: () => analyser.current }));

function fakeContext() {
  return {
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    lineWidth: 0,
    lineCap: '',
    lineJoin: '',
    strokeStyle: '',
  };
}

let frames: FrameRequestCallback[] = [];

beforeEach(() => {
  frames = [];
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    frames.push(cb);
    return frames.length;
  });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe = vi.fn();
      disconnect = vi.fn();
    }
  );
  window.matchMedia = vi.fn().mockReturnValue({ matches: false });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function runFrames(count: number) {
  for (let i = 0; i < count; i++) {
    const next = frames.shift();
    next?.(performance.now() + i * 16);
  }
}

describe('stepMotion', () => {
  const rest = { liveness: 0, drift: LAYERS.map(() => 0), bands: QUIET };

  it('swells towards live gradually, never in one jump', () => {
    const after = stepMotion(rest, true, 0.1);
    expect(after.liveness).toBeGreaterThan(0);
    expect(after.liveness).toBeLessThan(0.5);

    let motion = rest;
    for (let i = 0; i < 300; i++) motion = stepMotion(motion, true, 1 / 60);
    expect(motion.liveness).toBeGreaterThan(0.99);
  });

  it('drifts the two traces against each other, faster while live', () => {
    const atRest = stepMotion(rest, false, 1);
    expect(Math.sign(atRest.drift[0] ?? 0)).toBe(-Math.sign(atRest.drift[1] ?? 0));

    const live = stepMotion({ ...rest, liveness: 1 }, true, 1);
    expect(Math.abs(live.drift[0] ?? 0)).toBeGreaterThan(Math.abs(atRest.drift[0] ?? 0));
  });
});

describe('listening to the stream', () => {
  it('splits the spectrum into bass, mid and treble', () => {
    // 64 bins at 48 kHz: 375 Hz each. Loud bass, quiet rest.
    const frequencies = new Uint8Array(64);
    frequencies[0] = 255;
    const [bass, mid, treble] = bandsOf(frequencies, 48000);
    expect(bass).toBe(1);
    expect(mid).toBe(0);
    expect(treble).toBe(0);
  });

  it('reads each band between its recent floor and ceiling, so beats stand out', () => {
    let gain: Gain | null = null;
    const seen: number[] = [];
    // A saturated mix: the raw bass only moves between 0.92 and 0.98.
    for (let i = 0; i < 120; i++) {
      const raw: Bands = [i % 10 === 0 ? 0.98 : 0.92, 0.5, 0.5];
      const read = autoGain(gain, raw, 1 / 60);
      gain = read.gain;
      seen.push(read.bands[0]);
    }
    const late = seen.slice(60);
    expect(Math.max(...late)).toBeGreaterThan(0.7);
    expect(Math.min(...late)).toBeLessThan(0.1);
  });

  it('rises fast on a beat and falls back slowly', () => {
    const rest = { liveness: 1, drift: LAYERS.map(() => 0), bands: QUIET };
    const loud: Bands = [1, 0.5, 0.5];
    const up = stepMotion(rest, true, 0.05, loud);
    const down = stepMotion({ ...rest, bands: loud }, true, 0.05, QUIET);
    expect(up.bands[0] - 0.5).toBeGreaterThan(1 - down.bands[0]);
  });

  it('draws the mockup line untouched when nothing is heard', () => {
    const sines = LAYERS[0]!.sines;
    const plain = sines.reduce((y, [n, w, p]) => y + w * Math.sin(2 * Math.PI * n * 0.3 + p), 0);
    expect(traceOffset(sines, 0.3, QUIET)).toBeCloseTo(plain, 10);
    expect(Math.abs(traceOffset(sines, 0.3, [1, 1, 1]))).toBeGreaterThan(Math.abs(plain));
  });
});

describe('HorizonLine', () => {
  afterEach(() => {
    analyser.current = null;
  });

  it('beats the now dot with the bass while the live plays', () => {
    let frame = 0;
    const ctx = fakeContext();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      ctx as unknown as CanvasRenderingContext2D
    );
    analyser.current = {
      frequencyBinCount: 64,
      context: { sampleRate: 48000 },
      // A kick every half second (30 frames at 60 fps) over a loud, steady bass.
      getByteFrequencyData: (into: Uint8Array) =>
        into.fill(0).fill(frame++ % 30 < 3 ? 255 : 230, 0, 2),
    };

    render(
      <div data-horizon data-testid="horizon">
        <HorizonLine isPlaying />
      </div>
    );
    const levels: number[] = [];
    let now = performance.now();
    for (let i = 0; i < 120; i++) {
      now += 1000 / 60;
      frames.shift()?.(now);
      levels.push(Number(screen.getByTestId('horizon').style.getPropertyValue('--bass')));
    }
    expect(Math.max(...levels) - Math.min(...levels)).toBeGreaterThan(0.3);
  });

  it('draws the two traces on every frame', () => {
    const ctx = fakeContext();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      ctx as unknown as CanvasRenderingContext2D
    );

    render(<HorizonLine isPlaying={false} />);
    runFrames(2);

    expect(ctx.beginPath).toHaveBeenCalledTimes(4);
    expect(ctx.stroke).toHaveBeenCalledTimes(4);
    expect(ctx.lineTo).toHaveBeenCalled();
  });

  it('stops drawing on unmount', () => {
    const ctx = fakeContext();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      ctx as unknown as CanvasRenderingContext2D
    );

    const { unmount } = render(<HorizonLine isPlaying={false} />);
    unmount();

    expect(cancelAnimationFrame).toHaveBeenCalled();
  });
});
