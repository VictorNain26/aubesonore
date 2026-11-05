// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { routes } from './routes';
import { PAGE_TEST_TIMEOUT, settle } from './mocks/settle';

// The page chunk fails to load, as offline or blocked by an extension.
vi.mock('./pages/ArtistPage', () => {
  throw new Error('Failed to fetch dynamically imported module');
});

// Alone in its file: React Router warns once per module instance, so a page drawn before this one
// in the same file would swallow the warning this test listens for.
describe('App, the first page the client draws', { timeout: PAGE_TEST_TIMEOUT }, () => {
  it('draws nothing, and says nothing, while it loads', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const router = createMemoryRouter(routes, { initialEntries: ['/artiste/hania-rani'] });
    const { container } = render(<RouterProvider router={router} />);

    expect(container).toBeEmptyDOMElement();
    await settle(router);
    expect(warn.mock.calls.flat().join(' ')).not.toContain('HydrateFallback');
  });
});
