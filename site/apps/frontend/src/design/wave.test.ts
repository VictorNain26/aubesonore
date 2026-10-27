import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LAYERS, QUIET, hashOf, ruleMask, seedOf, traceOffset, wavePath, waveY } from './wave';

/** The y of every point of a path, in order. */
function ysOf(d: string): number[] {
  return [...d.matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g)].map((match) => Number(match[2]));
}

describe('wavePath', () => {
  const base = { width: 640, height: 40, amplitude: 6 };

  it('draws the same line for the same seed, and another for another seed', () => {
    expect(wavePath({ ...base, seed: 1.3 })).toBe(wavePath({ ...base, seed: 1.3 }));
    expect(wavePath({ ...base, seed: 1.3 })).not.toBe(wavePath({ ...base, seed: 4.7 }));
  });

  it('runs from the left edge to the right one, around the middle', () => {
    const d = wavePath({ ...base, seed: 2 });
    expect(d.startsWith('M0 ')).toBe(true);
    expect(d).toMatch(/L640 -?[\d.]+$/);
    const ys = ysOf(d);
    const mean = ys.reduce((sum, y) => sum + y, 0) / ys.length;
    expect(mean).toBeCloseTo(20, 0);
  });

  it('stops at its end, the same line as the whole one up to there', () => {
    const whole = ysOf(wavePath({ ...base, seed: 2, step: 4 }));
    const part = wavePath({ ...base, seed: 2, step: 4, end: 160 });
    expect(part).toMatch(/L160 -?[\d.]+$/);
    expect(ysOf(part)).toEqual(whole.slice(0, 41));
  });

  it('stays within its amplitude at rest, whatever the seed', () => {
    for (const seed of [0, 0.9, 3.3, 6.2, seedOf('a74b1b7f-71a5-4011-9441-d0b5e4122711')]) {
      const ys = ysOf(wavePath({ ...base, seed }));
      expect(Math.min(...ys)).toBeGreaterThanOrEqual(20 - 6);
      expect(Math.max(...ys)).toBeLessThanOrEqual(20 + 6);
      // A line, not a flat rule: it does move within that band.
      expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(6);
    }
  });

  it('swells with liveness up to the live amplitude, never past the height', () => {
    const rest = ysOf(wavePath({ ...base, seed: 1 }));
    const live = ysOf(wavePath({ ...base, seed: 1, amplitude: 3, liveness: 1 }));
    const span = (ys: number[]) => Math.max(...ys) - Math.min(...ys);
    expect(span(live)).toBeGreaterThan(span(rest));
    expect(Math.min(...live)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...live)).toBeLessThanOrEqual(40);
  });

  it('is flat where the envelope silences it', () => {
    const d = wavePath({ ...base, seed: 0, envelope: (u) => (u > 0.5 ? 0 : 1) });
    const ys = ysOf(d);
    expect(ys.slice(-10).every((y) => y === 20)).toBe(true);
    expect(ys.slice(0, 10).some((y) => y !== 20)).toBe(true);
  });

  it('meets itself at its two ends, so a tile of it repeats without a seam', () => {
    for (const seed of [0, 0.9, 5]) {
      const opts = { ...base, seed };
      expect(waveY(0, opts)).toBeCloseTo(waveY(640, opts), 9);
    }
  });
});

describe('waveY', () => {
  it("is the home page's horizon for seed 0: the first trace, as it was drawn", () => {
    const sines = LAYERS[0]!.sines;
    const opts = { width: 1000, height: 120, amplitude: 10 };
    expect(waveY(300, opts)).toBeCloseTo(60 + 10 * traceOffset(sines, 0.3, QUIET), 9);
  });

  it('draws the second trace with its own sines and gain', () => {
    const opts = { width: 1000, height: 120, amplitude: 10 };
    const second = LAYERS[1]!;
    expect(waveY(300, { ...opts, layer: 1 })).toBeCloseTo(
      60 + 10 * second.gain * traceOffset(second.sines, 0.3, QUIET),
      9
    );
  });
});

describe('seedOf', () => {
  it('gives an id the same phase every time, within a turn', () => {
    const id = 'a74b1b7f-71a5-4011-9441-d0b5e4122711';
    expect(seedOf(id)).toBe(seedOf(id));
    expect(seedOf(id)).not.toBe(seedOf('5441c29d-3602-4898-b1a1-b77fa23b8e50'));
    for (const s of ['', 'a', id, 'Earth, Wind & Fire']) {
      expect(seedOf(s)).toBeGreaterThanOrEqual(0);
      expect(seedOf(s)).toBeLessThan(2 * Math.PI);
    }
  });

  it('hashes a string to a non-negative integer', () => {
    expect(Number.isInteger(hashOf('Mickey 3D|Mimoun'))).toBe(true);
    expect(hashOf('Mickey 3D|Mimoun')).toBeGreaterThanOrEqual(0);
  });
});

describe('the calm rule', () => {
  it('is the mask tokens.css draws the rules with, so the stylesheet never drifts from the line', () => {
    const css = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8');
    expect(css).toContain(`--wave-rule: ${ruleMask()};`);
  });
});
