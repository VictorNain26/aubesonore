import { useEffect, useState } from 'react';

/** Where the hero is in a change of track (design/tokens.css: data-swap). */
export type Swap = 'idle' | 'out' | 'in';

/** The last track's leave: its words, its cover and « Juste avant » fade out. */
export const OUT_MS = 150;
/** The longest the next track waits for its cover: past it, it shows, its cover coming after. */
export const PRELOAD_MAX_MS = 2000;

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * The track the hero shows, and where it is in a change: the first comes at once; the next waits
 * for the last to leave (OUT_MS) and for its cover to be ready (`preload`, PRELOAD_MAX_MS at
 * most), so the cover never comes in as an empty square. A track that comes during the leave
 * replaces the one awaited. The same track (same sh_id) follows at once, details and all.
 */
export function useTrackSwap<T extends { sh_id: number }>(
  next: T | null,
  preload: (track: T) => Promise<void>
): { shown: T | null; swap: Swap } {
  const [state, setState] = useState<{ shown: T | null; swap: Swap }>({
    shown: next,
    swap: 'idle',
  });
  const changing = next !== null && state.shown !== null && next.sh_id !== state.shown.sh_id;

  if (!changing && next !== state.shown) {
    // The first track, the same track again, or none: no change to animate.
    setState({ shown: next, swap: next && state.shown ? state.swap : 'idle' });
  }

  const nextId = changing ? next.sh_id : null;
  useEffect(() => {
    if (nextId === null || next === null) return;
    let current = true;
    void Promise.all([
      wait(OUT_MS),
      Promise.race([preload(next).catch(() => undefined), wait(PRELOAD_MAX_MS)]),
    ]).then(() => {
      if (current) setState({ shown: next, swap: 'in' });
    });
    return () => {
      current = false;
    };
    // The track's id starts a change; its details alone do not.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextId]);

  return changing ? { shown: state.shown, swap: 'out' } : state;
}
