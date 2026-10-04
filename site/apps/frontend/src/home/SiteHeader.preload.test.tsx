// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { SiteHeader } from './SiteHeader';
import { useAuthStore } from '../stores/authStore';

// Counts the library module's evaluations: its own file, so no other test imports it first.
const library = vi.hoisted(() => ({ loads: 0 }));
vi.mock('../components/LikedTracksModal', async (importOriginal) => {
  library.loads += 1;
  return importOriginal();
});

afterEach(() => vi.useRealTimers());

describe('SiteHeader library preload', () => {
  it('loads nothing for a visitor who is not signed in', async () => {
    vi.useFakeTimers();
    useAuthStore.setState({ user: null, isAuthenticated: false, isLoading: false });
    render(<SiteHeader />, { wrapper: MemoryRouter });

    await vi.advanceTimersByTimeAsync(5000);
    expect(library.loads).toBe(0);
  });

  it("loads the library's code in the background once signed in, before any opening", async () => {
    vi.useFakeTimers();
    useAuthStore.setState({
      user: {
        id: '1',
        email: 'jane@example.com',
        name: 'Jane',
        image: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      isAuthenticated: true,
      isLoading: false,
    });
    render(<SiteHeader />, { wrapper: MemoryRouter });
    expect(library.loads).toBe(0);

    await vi.advanceTimersByTimeAsync(2000);
    await vi.waitFor(() => expect(library.loads).toBe(1));
  });
});
