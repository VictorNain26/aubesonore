// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react';
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';
import { NavigationPending } from './NavigationPending';

/** A router whose /next page loads until the test lets its data come. */
function site() {
  let arrive: () => void = () => {};
  const router = createMemoryRouter(
    [
      {
        element: (
          <>
            <NavigationPending />
            <Outlet />
          </>
        ),
        children: [
          { path: '/', element: <p>here</p> },
          {
            path: '/next',
            loader: () => new Promise<null>((resolve) => (arrive = () => resolve(null))),
            element: <p>next</p>,
          },
        ],
      },
    ],
    { initialEntries: ['/'] }
  );
  render(<RouterProvider router={router} />);
  return { router, arrive: () => arrive() };
}

const wait = (ms: number) => act(() => new Promise((resolve) => setTimeout(resolve, ms)));

describe('NavigationPending', () => {
  it('says the next page is coming once its data takes a while, and goes when it is there', async () => {
    const { router, arrive } = site();
    let navigating: Promise<void> = Promise.resolve();
    act(() => {
      navigating = router.navigate('/next');
    });

    // A page coming at once (the tab's cache) shows no line.
    await wait(100);
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    await wait(150);
    expect(screen.getByRole('progressbar', { name: 'Chargement…' })).toBeInTheDocument();
    expect(screen.getByText('here')).toBeInTheDocument();

    await act(async () => {
      arrive();
      await navigating;
    });
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.getByText('next')).toBeInTheDocument();
  });
});
