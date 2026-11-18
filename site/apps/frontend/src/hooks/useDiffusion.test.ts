// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useAirPlayStore } from '../stores/airplayStore';
import { useDiffusion } from './useDiffusion';

afterEach(() => {
  delete (window as { WebKitPlaybackTargetAvailabilityEvent?: unknown })
    .WebKitPlaybackTargetAvailabilityEvent;
});

// The server draws no cast button: in Safari, the first render must not either, or React throws
// the server's page away and draws it again. AirPlay shows once its store has looked, after.
it("offers AirPlay in Safari only once the store has found it, never in the page's first render", () => {
  Object.assign(window, { WebKitPlaybackTargetAvailabilityEvent: class extends Event {} });
  const { result } = renderHook(() => useDiffusion());
  expect(result.current).toBeNull();

  act(() => useAirPlayStore.getState().initialize());
  expect(result.current?.kind).toBe('airplay');
});
