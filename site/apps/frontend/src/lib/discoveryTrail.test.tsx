// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Trail from './discoveryTrail';

const STEREOLAB = { path: '/artiste/stereolab', name: 'Stereolab' };
const MCCARTHY = { path: '/artiste/mccarthy', name: 'McCarthy' };
const GANE = { path: '/artiste/tim-gane', name: 'Tim Gane' };
const NAMES: Record<string, string> = {
  [STEREOLAB.path]: STEREOLAB.name,
  [MCCARTHY.path]: MCCARTHY.name,
  [GANE.path]: GANE.name,
};

// Each test loads the module afresh, as a new page load of the tab does: what it reads first is
// what sessionStorage kept.
let trail: typeof Trail;
beforeEach(async () => {
  vi.resetModules();
  trail = await import('./discoveryTrail');
});
afterEach(() => {
  sessionStorage.clear();
});

describe('nextTrail', () => {
  it('goes on along the links from one artist to another', () => {
    expect(trail.nextTrail([STEREOLAB], MCCARTHY, 'link')).toEqual([STEREOLAB, MCCARTHY]);
  });

  it('starts again when the page was reached from anywhere else, even a page on the trail', () => {
    expect(trail.nextTrail([STEREOLAB, MCCARTHY], GANE, 'elsewhere')).toEqual([GANE]);
    expect(trail.nextTrail([STEREOLAB, MCCARTHY], MCCARTHY, 'elsewhere')).toEqual([MCCARTHY]);
  });

  it('cuts the trail at a step already on it, back or tapped', () => {
    expect(trail.nextTrail([STEREOLAB, MCCARTHY, GANE], MCCARTHY, 'back')).toEqual([
      STEREOLAB,
      MCCARTHY,
    ]);
    expect(trail.nextTrail([STEREOLAB, MCCARTHY, GANE], STEREOLAB, 'link')).toEqual([STEREOLAB]);
  });

  it('starts again when back leads to a page off the trail, and keeps the last six', () => {
    expect(trail.nextTrail([STEREOLAB], GANE, 'back')).toEqual([GANE]);
    const long = Array.from({ length: 6 }, (_, i) => ({ path: `/a/${i}`, name: `A${i}` }));
    expect(trail.nextTrail(long, GANE, 'link').map((s) => s.name)).toEqual([
      'A1',
      'A2',
      'A3',
      'A4',
      'A5',
      'Tim Gane',
    ]);
  });
});

/** An artist page as ArtistPage uses the trail: the names it shows, joined. */
function ArtistTrail() {
  const { pathname } = useLocation();
  const steps = trail.useDiscoveryTrail({ path: pathname, name: NAMES[pathname] ?? pathname });
  return <p>{steps.map((s) => s.name).join(' › ')}</p>;
}

function open(path: string) {
  const router = createMemoryRouter([{ path: '*', Component: ArtistTrail }], {
    initialEntries: [path],
  });
  render(<RouterProvider router={router} />);
  return router;
}

const shown = () => screen.getByRole('paragraph').textContent;

describe('useDiscoveryTrail', () => {
  it('follows the links from artist to artist, and Back walks it back', async () => {
    const router = open(STEREOLAB.path);
    expect(shown()).toBe('Stereolab');

    await act(() => router.navigate(MCCARTHY.path, { state: trail.DISCOVERY }));
    await act(() => router.navigate(GANE.path, { state: trail.DISCOVERY }));
    expect(shown()).toBe('Stereolab › McCarthy › Tim Gane');

    await act(() => router.navigate(-1));
    expect(shown()).toBe('Stereolab › McCarthy');

    // Reached from the search, the home page, a shared link: a new trail.
    await act(() => router.navigate(GANE.path));
    expect(shown()).toBe('Tim Gane');
  });

  it("keeps the tab's trail across a reload", async () => {
    const router = open(STEREOLAB.path);
    await act(() => router.navigate(MCCARTHY.path, { state: trail.DISCOVERY }));

    vi.resetModules();
    trail = await import('./discoveryTrail');
    // The reloaded page comes back at the same entry, a POP navigation as a reload is.
    open(MCCARTHY.path);

    expect(screen.getAllByRole('paragraph').at(-1)?.textContent).toBe('Stereolab › McCarthy');
  });

  it('drops what is not a step from what the tab stored', () => {
    sessionStorage.setItem(
      'aubesonore:trail',
      JSON.stringify([{ path: '/artiste/x' }, 7, null, { name: 'Y' }, STEREOLAB])
    );

    open(STEREOLAB.path);

    expect(shown()).toBe('Stereolab');
  });
});
