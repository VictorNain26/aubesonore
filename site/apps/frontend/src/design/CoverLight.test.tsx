// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { CoverLightView, LIGHT_FADE_MS } from './CoverLight';
import { lightOpacity, type LightInks } from './lightStrength';

// The night's paper and inks, as a browser reads them from the tokens (design/lightInks.ts).
const NIGHT: LightInks = {
  surface: [26, 32, 61],
  veil: [14, 20, 44, 0.38],
  veilMid: [16, 23, 50, 0.62],
  inks: [
    [238, 230, 220],
    [194, 194, 214],
  ],
  opacity: 0.9,
};
let inks: LightInks | null = NIGHT;
vi.mock('./lightInks', () => ({ readInks: () => inks }));

const art = (id: string) => `https://radio.aubesonore.fr/api/station/aubesonore/art/${id}-1.jpg`;
// Each light is its file, loaded unseen (decoration under aria-hidden: found only among the
// hidden), and the canvas it is painted into.
const files = () => screen.queryAllByRole('presentation', { hidden: true });
const lights = () => screen.queryAllByTestId('cover-light');
const srcs = () => files().map((img) => img.getAttribute('src'));

let drawn: { filter: string; image: unknown }[];
/** The cover's pixels as the canvas gives them back, or what it throws for a cover of another origin. */
let pixels: Uint8ClampedArray | Error;
const flat = (rgb: number[]) =>
  Uint8ClampedArray.from({ length: 64 * 4 }, (_, i) => (i % 4 === 3 ? 255 : rgb[i % 4]!));

beforeEach(() => {
  drawn = [];
  inks = NIGHT;
  pixels = flat([40, 30, 70]);
  const context = {
    filter: 'none',
    drawImage(image: unknown) {
      drawn.push({ filter: this.filter, image });
    },
    getImageData() {
      if (pixels instanceof Error) throw pixels;
      return { data: pixels };
    },
  };
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    context as unknown as CanvasRenderingContext2D
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('CoverLightView', () => {
  it('fetches the cover at its smallest size, in low priority, without a referrer', () => {
    render(<CoverLightView art={art('a1')} />);
    const [img] = files();

    expect(img).toHaveAttribute('src', '/covers/96/a1-1.jpg');
    expect(img).toHaveAttribute('fetchpriority', 'low');
    expect(img).toHaveAttribute('referrerpolicy', 'no-referrer');
    expect(img).not.toBeVisible();
    // Nothing of it reaches a screen reader.
    expect(screen.queryAllByRole('presentation')).toHaveLength(0);
  });

  it('paints the cover blurred into a small canvas once it has come, never blurring at the hero’s size', () => {
    render(<CoverLightView art={art('a1')} />);
    const [img] = files();
    const [canvas] = lights();

    expect(drawn).toHaveLength(0);
    fireEvent.load(img!);
    expect(drawn).toHaveLength(1);
    expect(drawn[0]!.image).toBe(img);
    expect(drawn[0]!.filter).toMatch(/^blur\(/);
    expect(canvas).toHaveAttribute('width', '32');
    expect(canvas).toHaveAttribute('height', '32');
    // The first light comes without a fade: it is the page's own.
    expect(canvas).not.toHaveClass('light-in');
  });

  it('asks Apple for the small WebP, through CORS so its pixels can be read', () => {
    const apple = 'https://is1-ssl.mzstatic.com/image/thumb/Music/aa/bb/x.jpg/600x600bb.jpg';
    render(<CoverLightView art={apple} />);
    expect(srcs()).toEqual([
      'https://is1-ssl.mzstatic.com/image/thumb/Music/aa/bb/x.jpg/96x96bb.webp',
    ]);
    expect(files()[0]).toHaveAttribute('crossorigin', 'anonymous');
  });

  it("asks the site's own covers without CORS: they are of the page's origin", () => {
    render(<CoverLightView art={art('a1')} />);
    expect(files()[0]).not.toHaveAttribute('crossorigin');
  });

  it('keeps the whole light of a cover the words read well on', () => {
    render(<CoverLightView art={art('a1')} />);
    fireEvent.load(files()[0]!);
    expect(lights()[0]!.style.opacity).toBe('0.9');
  });

  it('dims the light of a cover the words would not read on, just enough', () => {
    pixels = flat([255, 255, 255]);
    render(<CoverLightView art={art('a1')} />);
    fireEvent.load(files()[0]!);
    const opacity = Number(lights()[0]!.style.opacity);
    expect(opacity).toBeGreaterThan(0);
    expect(opacity).toBeLessThan(0.9);
    // The words are weighed under the veil where each pixel lies: never more than at the top.
    expect(opacity).toBeGreaterThanOrEqual(lightOpacity(flat([255, 255, 255]), NIGHT));
  });

  it('weighs a pixel under the veil of its depth: white low in the hero dims the light less', () => {
    // The part of the 32 px canvas the hero shows: 24 × 22 pixels, read row by row.
    const region = (white: (row: number) => boolean) =>
      Uint8ClampedArray.from({ length: 24 * 22 * 4 }, (_, i) =>
        i % 4 === 3 ? 255 : white(Math.floor(i / 4 / 24)) ? 255 : 30
      );
    const weigh = (white: (row: number) => boolean) => {
      pixels = region(white);
      const { unmount } = render(<CoverLightView art={art('a1')} />);
      fireEvent.load(files()[0]!);
      const opacity = Number(lights()[0]!.style.opacity);
      unmount();
      return opacity;
    };
    expect(weigh((row) => row >= 14)).toBeGreaterThan(weigh(() => true));
  });

  it('dims a cover whose pixels cannot be read as much as the worst cover would need', () => {
    // What a canvas tainted by a cover of another origin throws on getImageData.
    pixels = Object.assign(new Error('The canvas has been tainted'), { name: 'SecurityError' });
    render(<CoverLightView art={art('a1')} />);
    fireEvent.load(files()[0]!);
    const worst = new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255]);
    expect(Number(lights()[0]!.style.opacity)).toBe(lightOpacity(worst, NIGHT));
  });

  it('leaves the light at its style where the browser cannot read the inks', () => {
    inks = null;
    render(<CoverLightView art={art('a1')} />);
    fireEvent.load(files()[0]!);
    expect(lights()[0]!.style.opacity).toBe('');
  });

  it('weighs the light again when the device turns from day to night', () => {
    let onChange: (() => void) | undefined;
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({
        matches: false,
        addEventListener: (_: string, fn: () => void) => (onChange = fn),
        removeEventListener: vi.fn(),
      }))
    );
    pixels = flat([255, 255, 255]);
    inks = {
      ...NIGHT,
      surface: [240, 231, 222],
      veil: [240, 231, 222, 0.55],
      veilMid: [240, 231, 222, 0.72],
      inks: [
        [41, 45, 74],
        [77, 81, 113],
      ],
      opacity: 0.75,
    };
    render(<CoverLightView art={art('a1')} />);
    fireEvent.load(files()[0]!);
    // A white cover by day: the dark words read on it, the light is whole.
    expect(lights()[0]!.style.opacity).toBe('0.75');

    inks = NIGHT;
    act(() => onChange?.());
    expect(Number(lights()[0]!.style.opacity)).toBeLessThan(0.9);
    vi.unstubAllGlobals();
  });

  it('has no light without a real cover', () => {
    render(<CoverLightView art="https://radio.aubesonore.fr/static/img/generic_song.jpg" />);
    expect(files()).toHaveLength(0);
    expect(lights()).toHaveLength(0);
  });

  it('fades the next cover in over the last once it has come, then lets the last go', () => {
    vi.useFakeTimers();
    const { rerender } = render(<CoverLightView art={art('a1')} />);

    rerender(<CoverLightView art={art('b2')} />);
    expect(srcs()).toEqual(['/covers/96/a1-1.jpg', '/covers/96/b2-1.jpg']);
    const next = () => lights()[1]!;
    // Still loading: the last light holds, the next waits unseen.
    expect(next()).toHaveClass('invisible');
    expect(next()).not.toHaveClass('light-in');

    fireEvent.load(files()[1]!);
    expect(next()).toHaveClass('light-in');
    // The last fades out as the next fades in: no jump of tint when it goes.
    expect(lights()[0]).toHaveClass('light-out');

    act(() => {
      vi.advanceTimersByTime(LIGHT_FADE_MS);
    });
    expect(srcs()).toEqual(['/covers/96/b2-1.jpg']);
    expect(lights()[0]).not.toHaveClass('light-out');
  });

  it('cross-fades in one second', () => {
    expect(LIGHT_FADE_MS).toBe(1000);
  });

  it('holds two lights at most, the one shown and the newest, however fast the titles change', () => {
    const { rerender } = render(<CoverLightView art={art('a1')} />);

    // b2 never came: a1 is still what shows.
    rerender(<CoverLightView art={art('b2')} />);
    rerender(<CoverLightView art={art('c3')} />);
    expect(srcs()).toEqual(['/covers/96/a1-1.jpg', '/covers/96/c3-1.jpg']);

    // c3 came and is fading in: it is the one shown when d4 comes.
    fireEvent.load(files()[1]!);
    rerender(<CoverLightView art={art('d4')} />);
    expect(srcs()).toEqual(['/covers/96/c3-1.jpg', '/covers/96/d4-1.jpg']);
  });

  it('lets the last light go when the next cover cannot be had, and never asks it again', () => {
    vi.useFakeTimers();
    const { rerender } = render(<CoverLightView art={art('a1')} />);
    rerender(<CoverLightView art={art('b2')} />);

    fireEvent.error(files()[1]!);
    // The last track's light is not this track's: it fades out rather than stay all along.
    expect(srcs()).toEqual(['/covers/96/a1-1.jpg']);
    expect(lights()[0]).toHaveClass('light-out');
    act(() => {
      vi.advanceTimersByTime(LIGHT_FADE_MS);
    });
    expect(srcs()).toEqual([]);

    rerender(<CoverLightView art={art('b2')} />);
    expect(srcs()).toEqual([]);
    // The next track's light comes as any.
    rerender(<CoverLightView art={art('c3')} />);
    expect(srcs()).toEqual(['/covers/96/c3-1.jpg']);
    fireEvent.load(files()[0]!);
    expect(lights()[0]).toHaveClass('light-in');
  });
});
