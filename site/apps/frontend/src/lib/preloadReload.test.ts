import { describe, it, expect, vi } from 'vitest';
import { handlePreloadError } from './preloadReload';

describe('handlePreloadError', () => {
  function fakeStorage(initial?: Record<string, string>) {
    const map = new Map<string, string>(Object.entries(initial ?? {}));
    return {
      getItem: (key: string): string | null => map.get(key) ?? null,
      setItem: (key: string, value: string): void => void map.set(key, value),
      size: () => map.size,
    };
  }

  it('reloads and records a timestamp on the first failure', () => {
    const storage = fakeStorage();
    const reload = vi.fn();
    handlePreloadError(storage, reload, 1000);
    expect(reload).toHaveBeenCalledOnce();
    expect(storage.size()).toBe(1);
  });

  it('skips the reload when one just happened (loop guard)', () => {
    const storage = fakeStorage();
    const reload = vi.fn();
    handlePreloadError(storage, reload, 1000);
    handlePreloadError(storage, reload, 3000);
    expect(reload).toHaveBeenCalledOnce();
  });

  it('reloads again after the cooldown elapses', () => {
    const storage = fakeStorage();
    const reload = vi.fn();
    handlePreloadError(storage, reload, 1000);
    handlePreloadError(storage, reload, 20_000);
    expect(reload).toHaveBeenCalledTimes(2);
  });
});
