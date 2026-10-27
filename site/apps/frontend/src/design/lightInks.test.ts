// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readInks } from './lightInks';

/**
 * A canvas that knows rgb() and rgba() only, as a browser that cannot parse a colour keeps the last
 * fillStyle: the pixel it paints is that colour's bytes, its alpha in the fourth.
 */
function fakeCanvas() {
  let style = '#000000';
  let painted = [0, 0, 0, 0];
  return {
    get fillStyle() {
      return style;
    },
    set fillStyle(value: string) {
      if (/^#|^rgba?\(/.test(value)) style = value;
    },
    clearRect() {
      painted = [0, 0, 0, 0];
    },
    fillRect() {
      const [r, g, b, a = 1] = (style.match(/[\d.]+/g) ?? []).map(Number);
      painted = [r!, g!, b!, Math.round(a * 255)];
    },
    getImageData: () => ({ data: Uint8ClampedArray.from(painted) }),
  };
}

// The light's own tokens: the paper and the text's inks in the hero and the sheet, the bar and
// its inks in the player bar (design/tokens.css, player-bar).
const tokens = {
  '--light-ground': 'rgb(26, 32, 61)',
  '--light-veil-top': 'rgba(14, 20, 44, 0.38)',
  '--light-veil-mid': 'rgba(16, 23, 50, 0.62)',
  '--light-ink': 'rgb(238, 230, 220)',
  '--light-ink-muted': 'rgb(194, 194, 214)',
  '--light-opacity': '0.9',
};

let element: HTMLElement;
beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () => fakeCanvas() as unknown as CanvasRenderingContext2D
  );
  element = document.createElement('div');
  for (const [name, value] of Object.entries(tokens)) element.style.setProperty(name, value);
  document.body.append(element);
});
afterEach(() => {
  element.remove();
  vi.restoreAllMocks();
});

describe('readInks', () => {
  it('reads the paper, the veil with its alpha, the inks and the opacity as bytes', () => {
    expect(readInks(element)).toEqual({
      surface: [26, 32, 61],
      veil: [14, 20, 44, 97 / 255],
      veilMid: [16, 23, 50, 158 / 255],
      inks: [
        [238, 230, 220],
        [194, 194, 214],
      ],
      opacity: 0.9,
    });
  });

  it('tells nothing of a colour the browser cannot parse, rather than read the last one', () => {
    element.style.setProperty('--light-ink-muted', 'colour(nowhere)');
    expect(readInks(element)).toBeNull();
  });

  it('reads the inks of the surface the light lies on, never the page text over another', () => {
    // A bar inside the page: the paper's text ink is set, the bar's own inks are the light's.
    element.style.setProperty('--text', 'rgb(1, 2, 3)');
    element.style.setProperty('--surface', 'rgb(4, 5, 6)');
    expect(readInks(element)).toMatchObject({
      surface: [26, 32, 61],
      inks: [
        [238, 230, 220],
        [194, 194, 214],
      ],
    });
  });

  it('tells nothing without the opacity token', () => {
    element.style.removeProperty('--light-opacity');
    expect(readInks(element)).toBeNull();
  });
});
