// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { createMemoryRouter, Outlet, RouterProvider, ScrollRestoration } from 'react-router';
import { routes } from './routes';
import { InstantPageScroll, scrollKey } from './App';

// The page chunk fails to load, as offline or blocked by an extension.
vi.mock('./pages/ArtistPage', () => {
  throw new Error('Failed to fetch dynamically imported module');
});

describe('App', () => {
  it('shows the artist page error state when its chunk fails to load', async () => {
    const router = createMemoryRouter(routes, { initialEntries: ['/artiste/hania-rani'] });
    render(<RouterProvider router={router} />);

    expect(await screen.findByRole('heading', { name: 'Page indisponible.' })).toBeInTheDocument();
    // In the frame of every page, footer and way back to the live included.
    expect(screen.getByRole('link', { name: 'Revenir au direct' })).toBeInTheDocument();
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
  });
});

const at = (pathname: string, hash: string, key: string) => ({
  pathname,
  hash,
  key,
  search: '',
  state: null,
});

describe('a new page', () => {
  it('opens at the top at once, whatever the CSS scroll-behavior', async () => {
    const behaviours: string[] = [];
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {
      behaviours.push(document.documentElement.style.scrollBehavior);
    });
    const router = createMemoryRouter(
      [
        {
          path: '/',
          element: (
            <>
              <InstantPageScroll />
              <ScrollRestoration />
              <Outlet />
            </>
          ),
          children: [
            { path: 'a', element: <p>a</p> },
            { path: 'b', element: <p>b</p> },
          ],
        },
      ],
      { initialEntries: ['/a'] }
    );
    render(<RouterProvider router={router} />);
    await act(() => router.navigate('/b'));

    expect(await screen.findByText('b')).toBeInTheDocument();
    expect(behaviours.at(-1)).toBe('auto');
    vi.restoreAllMocks();
  });
});

describe('where a place is kept', () => {
  it('apart for each visit of a page, so a link back to it opens at the top', () => {
    expect(scrollKey(at('/artiste/a', '', 'k1'))).not.toBe(scrollKey(at('/artiste/a', '', 'k2')));
  });

  it("by page and anchor for an entry the router did not make, the tab's first or an anchor's", () => {
    expect(scrollKey(at('/artiste/a', '', 'default'))).toBe('/artiste/a');
    expect(scrollKey(at('/artiste/a', '#bands', 'default'))).toBe('/artiste/a#bands');
  });
});
