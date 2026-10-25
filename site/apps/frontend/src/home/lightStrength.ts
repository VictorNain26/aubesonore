/** An sRGB colour, as a canvas holds it: three bytes. */
export type Rgb = readonly [number, number, number];

/** What the hero's light is laid on and read through (design/tokens.css, cover-light). */
export interface LightInks {
  /** The paper under the light. */
  surface: Rgb;
  /** The veil over it at the top of the hero, where it is thinnest, and its alpha. */
  veil: readonly [number, number, number, number];
  /** The colours of the words over the light: the text and its muted ink. */
  inks: readonly Rgb[];
  /** The light's opacity when no word needs it lower. */
  opacity: number;
}

/** WCAG 2.2 AA for words under 24 px: the thread's times and artists stand at the top. */
const FLOOR = 4.5;

const linear = (byte: number) => {
  const c = byte / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const luminance = ([r, g, b]: Rgb) => 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);

/** The WCAG contrast ratio of two colours. */
export function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * The colour a pixel of the light gives at the top of the hero: the pixel at this opacity over the
 * paper, the veil over both. Composited on the bytes, as a browser composites translucent layers.
 */
export function litBy(pixel: Rgb, { surface, veil }: LightInks, opacity: number): Rgb {
  const alpha = veil[3];
  const at = (i: 0 | 1 | 2) =>
    alpha * veil[i] + (1 - alpha) * (opacity * pixel[i] + (1 - opacity) * surface[i]);
  return [at(0), at(1), at(2)];
}

/**
 * The light's opacity for one cover (its pixels, RGBA, as getImageData gives them): the full
 * light, unless a word at the top of the hero would fall under 4.5:1 over one of its pixels, then
 * the most light that keeps every word at 4.5:1 there. The worst pixel, not the mean: half a cover
 * black is enough to sink the words over that half.
 */
export function lightOpacity(pixels: Uint8ClampedArray, inks: LightInks): number {
  const shown: Rgb[] = [];
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] !== 0) shown.push([pixels[i]!, pixels[i + 1]!, pixels[i + 2]!]);
  }
  // 32 × 32 pixels at most, twelve times over: under a millisecond, once per cover.
  const reads = (opacity: number) =>
    shown.every((pixel) => {
      const lit = litBy(pixel, inks, opacity);
      return inks.inks.every((ink) => contrast(ink, lit) >= FLOOR);
    });
  if (reads(inks.opacity)) return inks.opacity;
  // The paper and the veil alone hold the words (scripts/check-contrast.mjs): somewhere between
  // no light and the full one is the most that reads.
  let [low, high] = [0, inks.opacity];
  for (let step = 0; step < 12; step++) {
    const mid = (low + high) / 2;
    if (reads(mid)) low = mid;
    else high = mid;
  }
  return low;
}
