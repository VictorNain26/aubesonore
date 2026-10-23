// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { routes } from './routes';
import { scrollKey } from './App';
import { PAGE_TEST_TIMEOUT, settle } from './mocks/settle';

// The page chunk fails to load, as offline or blocked by an extension.
vi.mock('./pages/ArtistPage', () => {
  throw new Error('Failed to fetch dynamically imported module');
});

describe('App', { timeout: PAGE_TEST_TIMEOUT }, () => {
  it('shows the artist page error state when its chunk fails to load', async () => {
    const router = createMemoryRouter(routes, { initialEntries: ['/artiste/hania-rani'] });
    render(<RouterProvider router={router} />);
    await settle(router);

    expect(screen.getByRole('heading', { name: 'Page indisponible.' })).toBeInTheDocument();
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

describe('where a place is kept', () => {
  it('apart for each visit of a page, so a link back to it opens at the top', () => {
    expect(scrollKey(at('/artiste/a', '', 'k1'))).not.toBe(scrollKey(at('/artiste/a', '', 'k2')));
  });

  it("by page and anchor for an entry the router did not make, the tab's first or an anchor's", () => {
    expect(scrollKey(at('/artiste/a', '', 'default'))).toBe('/artiste/a');
    expect(scrollKey(at('/artiste/a', '#bands', 'default'))).toBe('/artiste/a#bands');
  });
});
