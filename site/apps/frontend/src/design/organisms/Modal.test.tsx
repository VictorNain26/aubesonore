// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Modal } from './Modal';

describe('Modal', () => {
  it('opens when controlled and names the dialog after its title', () => {
    render(
      <Modal title="Panneau artiste" open onOpenChange={vi.fn()}>
        <p>Contenu</p>
      </Modal>
    );
    expect(screen.getByRole('dialog', { name: 'Panneau artiste' })).toBeInTheDocument();
  });

  it('calls onOpenChange with false when closed via the close button', () => {
    const onOpenChange = vi.fn();
    render(
      <Modal title="Panneau artiste" open onOpenChange={onOpenChange}>
        <p>Contenu</p>
      </Modal>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Fermer' }));
    expect(onOpenChange).toHaveBeenCalledWith(false, expect.anything());
  });

  it('caps the centered popup to the viewport so scrolled content stays reachable', () => {
    render(
      <Modal title="Panneau artiste" open onOpenChange={vi.fn()}>
        <p>Contenu</p>
      </Modal>
    );
    expect(screen.getByRole('dialog').className).toContain('max-h-[calc(100dvh-2rem)]');
  });

  it('shows the aside of the split variant next to the form', () => {
    render(
      <Modal
        title="Se connecter"
        open
        onOpenChange={vi.fn()}
        variant="split"
        aside={<p>Ambiance</p>}
      >
        <p>Formulaire</p>
      </Modal>
    );
    expect(screen.getByText('Ambiance')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Se connecter' })).toHaveTextContent('Formulaire');
  });
});
