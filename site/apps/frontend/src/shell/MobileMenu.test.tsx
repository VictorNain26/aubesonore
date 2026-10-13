// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { useAuthStore } from '../stores/authStore';
import { MobileMenu } from './MobileMenu';

function open(path = '/') {
  render(
    <MemoryRouter initialEntries={[path]}>
      <MobileMenu />
    </MemoryRouter>
  );
  return userEvent.click(screen.getByRole('button', { name: 'Menu' }));
}

beforeEach(() => {
  useAuthStore.setState({ user: null, isAuthenticated: false, isLoading: false });
});

describe('MobileMenu', () => {
  it('opens the pages a phone header has no room for, Musilogy among them', async () => {
    await open('/musilogy');

    const menu = screen.getByRole('dialog');
    const links = within(menu).getAllByRole('link');
    expect(links.map((link) => [link.textContent, link.getAttribute('href')])).toEqual([
      ['Le direct', '/'],
      ['Musilogy', '/musilogy'],
      ['Se connecter', '/connexion'],
    ]);
    expect(within(menu).getByRole('link', { name: 'Musilogy' })).toHaveAttribute(
      'aria-current',
      'page'
    );
  });

  it('offers Mes titres and signing out to a listener signed in', async () => {
    const signOut = vi.fn().mockResolvedValue(undefined);
    useAuthStore.setState({
      user: {
        id: 'u1',
        email: 'jane@example.com',
        name: 'Jane',
        image: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      isAuthenticated: true,
      signOut,
    });
    await open();

    const menu = screen.getByRole('dialog');
    expect(within(menu).getByRole('link', { name: 'Mes titres' })).toHaveAttribute(
      'href',
      '/mes-titres'
    );
    expect(within(menu).getByText('jane@example.com')).toBeInTheDocument();
    await userEvent.click(within(menu).getByRole('button', { name: 'Se déconnecter' }));
    expect(signOut).toHaveBeenCalledOnce();
  });

  it('closes once a page is chosen', async () => {
    await open();

    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('link', { name: 'Musilogy' })
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
