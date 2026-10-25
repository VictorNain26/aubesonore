// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { CoverLightView, LIGHT_FADE_MS } from './CoverLight';

const art = (id: string) => `https://radio.aubesonore.fr/api/station/aubesonore/art/${id}-1.jpg`;
// alt="" and under aria-hidden: found only among the hidden.
const lights = () => screen.queryAllByRole('presentation', { hidden: true });

afterEach(() => {
  vi.useRealTimers();
});

describe('CoverLightView', () => {
  it('lights the hero with the cover at its smallest size, in low priority, as decoration', () => {
    render(<CoverLightView art={art('a1')} />);
    const [img] = lights();

    expect(img).toHaveAttribute('src', '/covers/96/a1-1.jpg');
    expect(img).toHaveAttribute('fetchpriority', 'low');
    expect(img).toHaveAttribute('referrerpolicy', 'no-referrer');
    expect(img).toHaveAttribute('alt', '');
    expect(screen.queryAllByRole('presentation')).toHaveLength(0);
    // Drawn as it comes, pre-rendered with the page: no fade before the script runs.
    expect(img).not.toHaveClass('light-in');
  });

  it('asks Apple for the small WebP', () => {
    const apple = 'https://is1-ssl.mzstatic.com/image/thumb/Music/aa/bb/x.jpg/600x600bb.jpg';
    render(<CoverLightView art={apple} />);
    expect(lights()[0]).toHaveAttribute(
      'src',
      'https://is1-ssl.mzstatic.com/image/thumb/Music/aa/bb/x.jpg/96x96bb.webp'
    );
  });

  it('has no light without a real cover', () => {
    render(<CoverLightView art="https://radio.aubesonore.fr/static/img/generic_song.jpg" />);
    expect(lights()).toHaveLength(0);
  });

  it('fades the next cover in over the last once it has loaded, then lets the last go', () => {
    vi.useFakeTimers();
    const { rerender } = render(<CoverLightView art={art('a1')} />);

    rerender(<CoverLightView art={art('b2')} />);
    const [last, next] = lights();
    expect(last).toHaveAttribute('src', '/covers/96/a1-1.jpg');
    expect(next).toHaveAttribute('src', '/covers/96/b2-1.jpg');
    // Still loading: the last light holds, the next waits unseen.
    expect(next).toHaveClass('invisible');
    expect(next).not.toHaveClass('light-in');

    fireEvent.load(next!);
    expect(next).toHaveClass('light-in');
    expect(lights()).toHaveLength(2);

    act(() => {
      vi.advanceTimersByTime(LIGHT_FADE_MS);
    });
    expect(lights().map((img) => img.getAttribute('src'))).toEqual(['/covers/96/b2-1.jpg']);
  });

  it('holds two lights at most, the one shown and the newest, however fast the titles change', () => {
    const { rerender } = render(<CoverLightView art={art('a1')} />);
    const srcs = () => lights().map((img) => img.getAttribute('src'));

    // b2 never loaded: a1 is still what shows.
    rerender(<CoverLightView art={art('b2')} />);
    rerender(<CoverLightView art={art('c3')} />);
    expect(srcs()).toEqual(['/covers/96/a1-1.jpg', '/covers/96/c3-1.jpg']);

    // c3 loaded and fading in: it is the one shown when d4 comes.
    fireEvent.load(lights()[1]!);
    rerender(<CoverLightView art={art('d4')} />);
    expect(srcs()).toEqual(['/covers/96/c3-1.jpg', '/covers/96/d4-1.jpg']);
  });
});
