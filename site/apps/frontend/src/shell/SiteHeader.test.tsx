// @vitest-environment jsdom
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { SiteHeader } from './SiteHeader';
import { useAuthStore } from '../stores/authStore';

const mockMatchMedia = () => {
  window.matchMedia = vi.fn().mockReturnValue({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
};

const baseAuthState = {
  user: null,
  isAuthenticated: false,
  isLoading: false,
  authError: null,
};

beforeEach(() => {
  mockMatchMedia();
  window.history.replaceState({}, '', '/');
  useAuthStore.setState(baseAuthState);
});

describe('SiteHeader', () => {
  it('leads to the sign-in page when unauthenticated', () => {
    render(<SiteHeader />, { wrapper: MemoryRouter });

    expect(screen.getByRole('link', { name: 'Se connecter' })).toHaveAttribute(
      'href',
      '/connexion'
    );
  });

  function signIn(): ReturnType<typeof vi.fn> {
    const signOut = vi.fn().mockResolvedValue(undefined);
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
      authError: null,
      signOut,
    });
    return signOut;
  }

  it('leads to the Mes titres page, marked current once there', () => {
    signIn();
    const { unmount } = render(<SiteHeader />, { wrapper: MemoryRouter });

    const link = screen.getByRole('link', { name: 'Mes titres' });
    expect(link).toHaveAttribute('href', '/mes-titres');
    expect(link).not.toHaveAttribute('aria-current');
    unmount();

    render(
      <MemoryRouter initialEntries={['/mes-titres']}>
        <SiteHeader />
      </MemoryRouter>
    );
    expect(screen.getByRole('link', { name: 'Mes titres' })).toHaveAttribute(
      'aria-current',
      'page'
    );
  });

  it('marks Musilogy as the page the listener is on, and only there', () => {
    const { unmount } = render(
      <MemoryRouter initialEntries={['/musilogy']}>
        <SiteHeader />
      </MemoryRouter>
    );
    expect(screen.getByRole('link', { name: 'Musilogy' })).toHaveAttribute('aria-current', 'page');
    unmount();

    render(<SiteHeader />, { wrapper: MemoryRouter });
    expect(screen.getByRole('link', { name: 'Musilogy' })).not.toHaveAttribute('aria-current');
  });

  it('keeps the account in its own menu, where the listener signs out', async () => {
    const signOut = signIn();
    render(<SiteHeader />, { wrapper: MemoryRouter });

    await userEvent.click(screen.getByRole('button', { name: 'Mon compte' }));
    expect(await screen.findByText('jane@example.com')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Se déconnecter' }));
    expect(signOut).toHaveBeenCalled();
  });

  it('shows neither sign-in nor user menu while loading', () => {
    useAuthStore.setState({ ...baseAuthState, isLoading: true });

    render(<SiteHeader />, { wrapper: MemoryRouter });

    expect(screen.queryByRole('link', { name: 'Se connecter' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Mes titres' })).not.toBeInTheDocument();
  });

  it('opens my tracks only for a signed-in listener', () => {
    render(<SiteHeader />, { wrapper: MemoryRouter });
    expect(screen.queryByRole('link', { name: 'Mes titres' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Les plus gardés' })).not.toBeInTheDocument();
  });

  it('leads home from the name on every page, a heading on the home page only', () => {
    const { unmount } = render(<SiteHeader />, { wrapper: MemoryRouter });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/^AubeSonore, /);
    expect(screen.getByRole('link', { name: /^AubeSonore/ })).toHaveAttribute('href', '/');
    unmount();

    render(
      <MemoryRouter initialEntries={['/mentions-legales/']}>
        <SiteHeader />
      </MemoryRouter>
    );
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^AubeSonore/ })).toHaveAttribute('href', '/');
  });
});
