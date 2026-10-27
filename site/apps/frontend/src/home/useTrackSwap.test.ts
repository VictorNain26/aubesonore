// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { OUT_MS, PRELOAD_MAX_MS, useTrackSwap } from './useTrackSwap';

const track = (sh_id: number) => ({ sh_id, title: `Track ${sh_id}` });
type Track = ReturnType<typeof track>;

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

/** A preload the test settles by hand, per track. */
function preloads() {
  const pending = new Map<number, () => void>();
  const preload = vi.fn(
    (t: Track) => new Promise<void>((resolve) => pending.set(t.sh_id, resolve))
  );
  return { preload, settle: (id: number) => pending.get(id)?.() };
}

describe('useTrackSwap', () => {
  it('shows the first track at once, with nothing to animate', () => {
    const { preload } = preloads();
    const { result } = renderHook(() => useTrackSwap(track(1), preload));
    expect(result.current).toEqual({ shown: track(1), swap: 'idle' });
    expect(preload).not.toHaveBeenCalled();
  });

  it('lets the last track leave, then shows the next once its cover is ready', async () => {
    const { preload, settle } = preloads();
    const { result, rerender } = renderHook(({ next }) => useTrackSwap(next, preload), {
      initialProps: { next: track(1) },
    });

    rerender({ next: track(2) });
    expect(result.current).toEqual({ shown: track(1), swap: 'out' });
    expect(preload).toHaveBeenCalledWith(track(2));

    // The leave is over, the cover not yet: the last track holds, gone from view.
    await act(() => vi.advanceTimersByTimeAsync(OUT_MS));
    expect(result.current.shown).toEqual(track(1));

    settle(2);
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(result.current).toEqual({ shown: track(2), swap: 'in' });
  });

  it('waits the leave out even when the cover is ready at once', async () => {
    const { preload, settle } = preloads();
    const { result, rerender } = renderHook(({ next }) => useTrackSwap(next, preload), {
      initialProps: { next: track(1) },
    });
    rerender({ next: track(2) });
    settle(2);
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(result.current.shown).toEqual(track(1));

    await act(() => vi.advanceTimersByTimeAsync(OUT_MS));
    expect(result.current).toEqual({ shown: track(2), swap: 'in' });
  });

  it('shows the next track after two seconds even if its cover never comes', async () => {
    const { preload } = preloads();
    const { result, rerender } = renderHook(({ next }) => useTrackSwap(next, preload), {
      initialProps: { next: track(1) },
    });
    rerender({ next: track(2) });

    await act(() => vi.advanceTimersByTimeAsync(PRELOAD_MAX_MS - 1));
    expect(result.current.shown).toEqual(track(1));
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(result.current).toEqual({ shown: track(2), swap: 'in' });
  });

  it('goes straight to the newest track when another comes during the leave', async () => {
    const { preload, settle } = preloads();
    const { result, rerender } = renderHook(({ next }) => useTrackSwap(next, preload), {
      initialProps: { next: track(1) },
    });
    rerender({ next: track(2) });
    rerender({ next: track(3) });
    settle(2);
    settle(3);
    await act(() => vi.advanceTimersByTimeAsync(0));
    await act(() => vi.advanceTimersByTimeAsync(OUT_MS));
    expect(result.current).toEqual({ shown: track(3), swap: 'in' });
  });

  it('follows the same track at once when only its details change', () => {
    const { preload } = preloads();
    const { result, rerender } = renderHook(({ next }) => useTrackSwap(next, preload), {
      initialProps: { next: track(1) },
    });
    rerender({ next: { sh_id: 1, title: 'Track 1 (remastered)' } });
    expect(result.current).toEqual({
      shown: { sh_id: 1, title: 'Track 1 (remastered)' },
      swap: 'idle',
    });
  });

  it('shows nothing when no track is on air', () => {
    const { preload } = preloads();
    const initialProps: { next: Track | null } = { next: track(1) };
    const { result, rerender } = renderHook(({ next }) => useTrackSwap(next, preload), {
      initialProps,
    });
    rerender({ next: null });
    expect(result.current.shown).toBeNull();
  });
});
