import { act } from '@testing-library/react';
import type { DataRouter, RouterState } from 'react-router';

/**
 * The time a test that draws a whole page through the router may take. A file's first such page
 * is drawn cold (the first React render of every component, then role queries over the full page):
 * measured at 1.6 to 6.9 s with the machine at load average 15 to 19 on 4 cores, past Vitest's
 * 5 s default; the same tests take under a second once warm. The work is real, not a wait.
 */
export const PAGE_TEST_TIMEOUT = 20_000;

const idle = (state: RouterState) =>
  state.initialized && state.navigation.state === 'idle' && state.revalidation === 'idle';

/**
 * Resolves once the router has loaded what it was asked for (lazy chunks, loaders) and React has
 * drawn the result. Awaited rather than polled with findBy*: drawing a whole page in jsdom is real
 * render work, which on a loaded machine outlasted findBy*'s one second; act returns only once
 * React has committed what the settled router asked for, however long that takes.
 */
export async function settle(router: DataRouter): Promise<void> {
  await act(
    () =>
      new Promise<void>((resolve) => {
        if (idle(router.state)) {
          resolve();
          return;
        }
        const unsubscribe = router.subscribe((state) => {
          if (!idle(state)) return;
          unsubscribe();
          resolve();
        });
      })
  );
}
