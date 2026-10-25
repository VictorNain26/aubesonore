// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { CoverLightView, LIGHT_FADE_MS } from './CoverLight';

const art = (id: string) => `https://radio.aubesonore.fr/api/station/aubesonore/art/${id}-1.jpg`;
// Each light is its file, loaded unseen (decoration under aria-hidden: found only among the
// hidden), and the canvas it is painted into.
const files = () => screen.queryAllByRole('presentation', { hidden: true });
const lights = () => screen.queryAllByTestId('cover-light');
const srcs = () => files().map((img) => img.getAttribute('src'));

let drawn: { filter: string; image: unknown }[];

beforeEach(() => {
  drawn = [];
  const context = {
    filter: 'none',
    drawImage(image: unknown) {
      drawn.push({ filter: this.filter, image });
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

  it('asks Apple for the small WebP', () => {
    const apple = 'https://is1-ssl.mzstatic.com/image/thumb/Music/aa/bb/x.jpg/600x600bb.jpg';
    render(<CoverLightView art={apple} />);
    expect(srcs()).toEqual([
      'https://is1-ssl.mzstatic.com/image/thumb/Music/aa/bb/x.jpg/96x96bb.webp',
    ]);
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

    act(() => {
      vi.advanceTimersByTime(LIGHT_FADE_MS);
    });
    expect(srcs()).toEqual(['/covers/96/b2-1.jpg']);
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
});
