// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TextField } from './TextField';

describe('TextField', () => {
  it('associates the label with the input', () => {
    render(<TextField label="Adresse e-mail" type="email" autoComplete="email" />);
    expect(screen.getByLabelText('Adresse e-mail')).toBeInTheDocument();
  });
  it('shows the error message when provided', () => {
    render(<TextField label="Adresse e-mail" error="Adresse invalide — vérifie le format." />);
    expect(screen.getByText('Adresse invalide — vérifie le format.')).toBeInTheDocument();
  });
  it('shows no error element without error', () => {
    render(<TextField label="Adresse e-mail" />);
    expect(screen.queryByText(/invalide/)).not.toBeInTheDocument();
  });
  it('renders the trailing action next to the input', () => {
    render(
      <TextField
        label="Mot de passe"
        type="password"
        trailing={
          <button type="button" aria-label="Afficher le mot de passe">
            o
          </button>
        }
      />
    );
    expect(screen.getByRole('button', { name: 'Afficher le mot de passe' })).toBeInTheDocument();
  });
});
