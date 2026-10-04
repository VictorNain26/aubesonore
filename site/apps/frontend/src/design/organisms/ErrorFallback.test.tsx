// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ErrorBoundary } from 'react-error-boundary';
import { ModalErrorFallback } from './ErrorFallback';

describe('ModalErrorFallback', () => {
  function BoomModal(): never {
    throw new Error('boom');
  }

  it('renders message and close button when child throws', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onClose = vi.fn();
    render(
      <ErrorBoundary
        FallbackComponent={(props) => <ModalErrorFallback {...props} onClose={onClose} />}
      >
        <BoomModal />
      </ErrorBoundary>
    );
    expect(screen.getByRole('alert')).toHaveTextContent('La fenêtre a rencontré un problème.');
    expect(screen.getByRole('heading', { name: 'Une erreur est survenue' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /fermer/i }).length).toBeGreaterThan(0);
    spy.mockRestore();
  });

  it('calls onClose when the close button is clicked', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onClose = vi.fn();
    render(
      <ErrorBoundary
        FallbackComponent={(props) => <ModalErrorFallback {...props} onClose={onClose} />}
      >
        <BoomModal />
      </ErrorBoundary>
    );
    const closeButtons = screen.getAllByRole('button', { name: /fermer/i });
    const lastCloseButton = closeButtons.at(-1);
    if (!lastCloseButton) throw new Error('expected a close button');
    await userEvent.click(lastCloseButton);
    expect(onClose).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('calls onClose on Escape', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onClose = vi.fn();
    render(
      <ErrorBoundary
        FallbackComponent={(props) => <ModalErrorFallback {...props} onClose={onClose} />}
      >
        <BoomModal />
      </ErrorBoundary>
    );
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
    spy.mockRestore();
  });
});
