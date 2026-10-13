// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Button } from './Button';

describe('Button', () => {
  it('fires clicks when enabled', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Écouter</Button>);
    fireEvent.click(screen.getByRole('button', { name: 'Écouter' }));
    expect(onClick).toHaveBeenCalledOnce();
  });
  it('is disabled and busy while loading', () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Envoi
      </Button>
    );
    const button = screen.getByRole('button', { name: 'Envoi' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
  it('stays disabled while loading even with disabled={false}', () => {
    render(
      <Button loading disabled={false}>
        Envoi
      </Button>
    );
    expect(screen.getByRole('button', { name: 'Envoi' })).toBeDisabled();
  });
  it('keeps the accessible name on icon variant via aria-label', () => {
    render(<Button variant="icon" aria-label="Partager" />);
    expect(screen.getByRole('button', { name: 'Partager' })).toBeInTheDocument();
  });
});
