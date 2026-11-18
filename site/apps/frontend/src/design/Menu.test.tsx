// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { Button } from './Button';
import { Menu } from './Menu';

function renderMenu(onShare = vi.fn()) {
  render(
    <Menu
      trigger={
        <Button variant="icon" aria-label="Options">
          ⋯
        </Button>
      }
      items={[{ label: 'Partager', onSelect: onShare }]}
    />
  );
  return { onShare };
}

describe('Menu', () => {
  it('fires onSelect when an enabled item is clicked', () => {
    const { onShare } = renderMenu();
    fireEvent.click(screen.getByRole('button', { name: 'Options' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Partager' }));
    expect(onShare).toHaveBeenCalledOnce();
  });

  it('offers a choice beside the actions, as checked radio items under its name', () => {
    const onChange = vi.fn();
    const onSignOut = vi.fn();
    render(
      <Menu
        trigger={<button type="button">Compte</button>}
        choice={{
          label: 'Thème',
          value: 'light',
          options: [
            { value: 'system', label: 'Système' },
            { value: 'light', label: 'Clair' },
            { value: 'dark', label: 'Sombre' },
          ],
          onChange,
        }}
        items={[{ label: 'Se déconnecter', onSelect: onSignOut }]}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Compte' }));
    const group = screen.getByRole('group', { name: 'Thème' });
    expect(within(group).getByRole('menuitemradio', { name: 'Clair' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
    const dark = within(group).getByRole('menuitemradio', { name: 'Sombre' });
    expect(dark).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(dark);
    expect(onChange).toHaveBeenCalledWith('dark');

    fireEvent.click(screen.getByRole('menuitem', { name: 'Se déconnecter' }));
    expect(onSignOut).toHaveBeenCalledOnce();
  });

  it('affiche le header non interactif au-dessus des items', async () => {
    render(
      <Menu
        trigger={<button type="button">Ouvrir</button>}
        header={<p>victor@example.com</p>}
        items={[{ label: 'Déconnexion', onSelect: () => {} }]}
      />
    );
    await userEvent.click(screen.getByRole('button', { name: 'Ouvrir' }));
    expect(await screen.findByText('victor@example.com')).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /victor@example.com/ })).toBeNull();
  });
});
