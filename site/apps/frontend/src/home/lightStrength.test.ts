import { describe, expect, it } from 'vitest';
import { contrast, lightOpacity, litBy, type LightInks } from './lightStrength';

// The paper and its inks by day and by night, as sRGB bytes (design/tokens.css, read in a browser).
const DAY: LightInks = {
  surface: [240, 231, 222],
  veil: [240, 231, 222, 0.55],
  inks: [
    [41, 45, 74],
    [77, 81, 113],
  ],
  opacity: 0.75,
};
const NIGHT: LightInks = {
  surface: [26, 32, 61],
  veil: [14, 20, 44, 0.38],
  inks: [
    [238, 230, 220],
    [194, 194, 214],
  ],
  opacity: 0.9,
};

/** A cover of one colour, as a canvas gives its pixels. */
const flat = (rgb: [number, number, number], n = 64) =>
  Uint8ClampedArray.from({ length: n * 4 }, (_, i) => (i % 4 === 3 ? 255 : rgb[i % 4]!));

/** The worst ratio of the inks over the light of these pixels at this opacity. */
const worst = (pixels: Uint8ClampedArray, inks: LightInks, opacity: number) => {
  let low = Infinity;
  for (let i = 0; i < pixels.length; i += 4) {
    const lit = litBy([pixels[i]!, pixels[i + 1]!, pixels[i + 2]!], inks, opacity);
    for (const ink of inks.inks) low = Math.min(low, contrast(ink, lit));
  }
  return low;
};

describe('lightOpacity', () => {
  it('keeps the full light of a cover the text reads well on', () => {
    // A pale cover by day, a deep one by night: the mockup's light, whole.
    expect(lightOpacity(flat([200, 190, 170]), DAY)).toBe(0.75);
    expect(lightOpacity(flat([40, 30, 70]), NIGHT)).toBe(0.9);
  });

  it('dims the light of a black cover by day just enough for the text to keep 4.5:1', () => {
    const pixels = flat([0, 0, 0]);
    expect(worst(pixels, DAY, DAY.opacity)).toBeLessThan(4.5);

    const opacity = lightOpacity(pixels, DAY);
    expect(opacity).toBeGreaterThan(0);
    expect(opacity).toBeLessThan(0.75);
    expect(worst(pixels, DAY, opacity)).toBeGreaterThanOrEqual(4.5);
    // Just enough: a little more light and the text would fail.
    expect(worst(pixels, DAY, opacity + 0.02)).toBeLessThan(4.5);
  });

  it('dims the light of a white cover by night', () => {
    const pixels = flat([255, 255, 255]);
    const opacity = lightOpacity(pixels, NIGHT);
    expect(opacity).toBeLessThan(0.9);
    expect(worst(pixels, NIGHT, opacity)).toBeGreaterThanOrEqual(4.5);
  });

  it('answers for the worst pixel, not the mean: a cover half white is dimmed by night', () => {
    const half = new Uint8ClampedArray([...flat([20, 20, 40], 32), ...flat([250, 250, 250], 32)]);
    const opacity = lightOpacity(half, NIGHT);
    expect(opacity).toBe(lightOpacity(flat([250, 250, 250]), NIGHT));
    expect(worst(half, NIGHT, opacity)).toBeGreaterThanOrEqual(4.5);
  });

  it('leaves out pixels the cover does not cover, and keeps the light without any', () => {
    const clear = Uint8ClampedArray.from({ length: 64 * 4 }, () => 0);
    expect(lightOpacity(clear, NIGHT)).toBe(0.9);
    expect(lightOpacity(new Uint8ClampedArray(), DAY)).toBe(0.75);
  });
});

describe('contrast', () => {
  it('is the WCAG ratio', () => {
    expect(contrast([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 5);
    expect(contrast([255, 255, 255], [255, 255, 255])).toBe(1);
    // #777 on white, the classic 4.48.
    expect(contrast([119, 119, 119], [255, 255, 255])).toBeCloseTo(4.48, 2);
  });
});
