import { describe, expect, it } from 'vitest';
import { nextHeaderScroll, type HeaderScroll, type HeaderState } from './headerOnScroll';

const HEIGHT = 64;

/** The header's states as the page scrolls through `ys`, from the top. */
function states(ys: number[]): HeaderState[] {
  let at: HeaderScroll = { state: 'rest', turnedAt: 0 };
  return ys.map((y) => (at = nextHeaderScroll(at, y, HEIGHT)).state);
}

describe('nextHeaderScroll', () => {
  it('scrolls away with the page, and leaves the flow only once out of sight', () => {
    expect(states([30, HEIGHT, HEIGHT + 1, 400])).toEqual(['rest', 'rest', 'hidden', 'hidden']);
  });

  it('comes back as soon as the page goes up, past a trackpad jitter of 8 px', () => {
    // Down to 400, back up 8 px (jitter), then 9 px from the furthest point.
    expect(states([400, 600, 592, 591])).toEqual(['hidden', 'hidden', 'hidden', 'shown']);
  });

  it('leaves again when the page goes down past 8 px from where it turned', () => {
    // Shown at 500, up to 480 (where it turned), down 8 px (jitter), then 9 px.
    expect(states([400, 600, 500, 480, 488, 489])).toEqual([
      'hidden',
      'hidden',
      'shown',
      'shown',
      'shown',
      'hidden',
    ]);
  });

  it('is at rest again at the top of the page', () => {
    expect(states([400, 600, 500, 0])).toEqual(['hidden', 'hidden', 'shown', 'rest']);
  });
});
