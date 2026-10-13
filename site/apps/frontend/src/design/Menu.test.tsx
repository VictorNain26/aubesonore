// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { Button } from './Button';
import { Menu } from './Menu';

function renderMenu(onShare = vi.fn(), onDelete = vi.fn()) {
  render(
    <Menu
      trigger={
        <Button variant="icon" aria-label="Options">
          ⋯
        </Button>
      }
      items={[
        { label: 'Partager', onSelect: onShare },
        { label: 'Supprimer', onSelect: onDelete, disabled: true },
      ]}
    />
  );
  return { onShare, onDelete };
}

describe('Menu', () => {
  it('opens from the trigger', () => {
    renderMenu();
    expect(screen.queryByRole('menuitem')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Options' }));
    expect(screen.getAllByRole('menuitem')).toHaveLength(2);
  });

  it('fires onSelect when an enabled item is clicked', () => {
    const { onShare } = renderMenu();
    fireEvent.click(screen.getByRole('button', { name: 'Options' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Partager' }));
    expect(onShare).toHaveBeenCalledOnce();
  });

  it('does not fire onSelect for a disabled item', () => {
    const { onDelete } = renderMenu();
    fireEvent.click(screen.getByRole('button', { name: 'Options' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Supprimer' }));
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('exposes selected items as checked radio items', () => {
    const onSelectDeezer = vi.fn();
    render(
      <Menu
        trigger={<button type="button">Plateforme</button>}
        items={[
          { label: 'Spotify', onSelect: () => {}, selected: true },
          { label: 'Deezer', onSelect: onSelectDeezer, selected: false },
        ]}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Plateforme' }));
    expect(screen.getByRole('menuitemradio', { name: 'Spotify' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
    const deezer = screen.getByRole('menuitemradio', { name: 'Deezer' });
    expect(deezer).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(deezer);
    expect(onSelectDeezer).toHaveBeenCalledOnce();
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
