// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SearchField } from './SearchField';

function Field({ onType }: { onType?: () => void }) {
  const [query, setQuery] = useState('');
  return (
    <SearchField
      label="Chercher un artiste"
      placeholder="Un nom"
      query={query}
      onQueryChange={setQuery}
      onType={onType}
    />
  );
}

describe('SearchField', () => {
  it('names its field and holds it in a search landmark', () => {
    render(<Field />);
    const field = screen.getByRole('searchbox', { name: 'Chercher un artiste' });
    expect(screen.getByRole('search')).toContainElement(field);
  });

  it('offers to clear only once something is typed, and gives the focus back to the field', async () => {
    render(<Field />);
    const field = screen.getByRole('searchbox', { name: 'Chercher un artiste' });
    expect(screen.queryByRole('button', { name: 'Effacer la recherche' })).not.toBeInTheDocument();

    await userEvent.type(field, 'can');
    await userEvent.click(screen.getByRole('button', { name: 'Effacer la recherche' }));
    expect(field).toHaveValue('');
    expect(field).toHaveFocus();
    expect(screen.queryByRole('button', { name: 'Effacer la recherche' })).not.toBeInTheDocument();
  });

  it('clears on Escape', async () => {
    render(<Field />);
    const field = screen.getByRole('searchbox', { name: 'Chercher un artiste' });
    await userEvent.type(field, 'can{Escape}');
    expect(field).toHaveValue('');
  });

  it('tells each letter typed, never a clearing', async () => {
    const onType = vi.fn();
    render(<Field onType={onType} />);
    const field = screen.getByRole('searchbox', { name: 'Chercher un artiste' });
    await userEvent.type(field, 'ab');
    expect(onType).toHaveBeenCalledTimes(2);

    await userEvent.type(field, '{Escape}');
    await userEvent.type(field, 'c');
    await userEvent.click(screen.getByRole('button', { name: 'Effacer la recherche' }));
    expect(onType).toHaveBeenCalledTimes(3);
  });
});
