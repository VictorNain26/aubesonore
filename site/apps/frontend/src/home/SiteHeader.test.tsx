// @vitest-environment jsdom
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { SiteHeader } from './SiteHeader';
import { useAuthStore } from '../stores/authStore';
import { useAuthModalStore } from '../stores/authModalStore';

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
  useAuthModalStore.setState({ isOpen: false, mode: 'signin', resetToken: null });
});

describe('SiteHeader', () => {
  it('shows the sign-in button when unauthenticated and opens the auth modal on click', async () => {
    render(<SiteHeader />, { wrapper: MemoryRouter });

    const button = screen.getByRole('button', { name: 'Se connecter' });
    await userEvent.click(button);

    expect(useAuthModalStore.getState().isOpen).toBe(true);
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

  it('opens Mes titres in a drawer named like its button', async () => {
    signIn();
    render(<SiteHeader />, { wrapper: MemoryRouter });

    await userEvent.click(screen.getByRole('button', { name: 'Mes titres' }));
    expect(await screen.findByRole('dialog', { name: 'Mes titres' })).toBeInTheDocument();
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

    expect(screen.queryByRole('button', { name: 'Se connecter' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mes titres' })).not.toBeInTheDocument();
  });

  it('opens my tracks only for a signed-in listener', () => {
    render(<SiteHeader />, { wrapper: MemoryRouter });
    expect(screen.queryByRole('button', { name: 'Mes titres' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Les plus gardés' })).toHaveAttribute(
      'href',
      '#plus-gardes'
    );
  });
});
