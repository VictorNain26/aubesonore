import { useEffect, useRef, useState } from 'react';

/**
 * Where the header is: at rest in the page's flow at the top, then out of the way while the page
 * goes down, and back as soon as it goes up: a partially persistent header
 * (https://www.nngroup.com/articles/sticky-headers/).
 */
export type HeaderState = 'rest' | 'hidden' | 'shown';

export interface HeaderScroll {
  state: HeaderState;
  /** Where the scroll last turned, or the furthest it went since. */
  turnedAt: number;
}

// A few pixels of scroll before the header moves, so a trackpad's jitter neither shows nor hides it.
const THRESHOLD = 8;

/** The header's next state once the page has scrolled to `y`, the header being `height` tall at rest. */
export function nextHeaderScroll(
  { state, turnedAt }: HeaderScroll,
  y: number,
  height: number
): HeaderScroll {
  if (y <= 0) return { state: 'rest', turnedAt: 0 };
  // At rest the header scrolls away with the page; it only leaves the flow once out of sight.
  if (state === 'rest') return y > height ? { state: 'hidden', turnedAt: y } : { state, turnedAt };
  if (state === 'hidden') {
    if (y > turnedAt) return { state, turnedAt: y };
    return turnedAt - y > THRESHOLD ? { state: 'shown', turnedAt: y } : { state, turnedAt };
  }
  if (y < turnedAt) return { state, turnedAt: y };
  return y - turnedAt > THRESHOLD ? { state: 'hidden', turnedAt: y } : { state, turnedAt };
}

/**
 * Follows the page's scroll for the header: its state, whether it slides there (between hidden
 * and shown only: leaving the rest it is already out of sight), and the height its place in the
 * flow keeps while it is out of the flow, so the page below does not move.
 */
export function useHeaderOnScroll() {
  const slot = useRef<HTMLDivElement>(null);
  const current = useRef<HeaderScroll>({ state: 'rest', turnedAt: 0 });
  const [view, setView] = useState<{ state: HeaderState; slides: boolean; height: number | null }>({
    state: 'rest',
    slides: false,
    height: null,
  });

  useEffect(() => {
    const el = slot.current;
    if (!el) return;
    let restHeight = el.offsetHeight;
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const before = current.current;
        if (before.state === 'rest') restHeight = el.offsetHeight;
        const next = nextHeaderScroll(before, window.scrollY, restHeight);
        if (next.state !== before.state) {
          setView({
            state: next.state,
            slides: next.state !== 'rest' && before.state !== 'rest',
            height: next.state === 'rest' ? null : restHeight,
          });
        }
        current.current = next;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);

  /** A key that reaches the hidden header brings it back: focus is never off the screen. */
  const onFocus = () => {
    if (current.current.state !== 'hidden') return;
    current.current = { state: 'shown', turnedAt: window.scrollY };
    setView((was) => ({ ...was, state: 'shown', slides: true }));
  };

  return { slot, onFocus, ...view };
}
