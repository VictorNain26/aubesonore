// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { MusilogyHomeView } from './SearchView';

const T_REX = 'c842d29f-a297-48cd-bb71-4f77fd672b16';
const TYRANNOSAURUS = '00000000-0000-4000-8000-00000000a1e7';

describe('MusilogyHomeView', () => {
  it('searches as the listener types and lists what it finds', async () => {
    const onQueryChange = vi.fn();
    render(
      <MusilogyHomeView
        query=""
        onQueryChange={onQueryChange}
        search={{
          status: 'done',
          hits: [
            {
              mbid: T_REX,
              name: 'T. Rex',
              disambiguation: null,
              kind: 'group',
              y0: 1967,
              slug: 't-rex',
            },
            {
              mbid: TYRANNOSAURUS,
              name: 'Tyrannosaurus Rex',
              disambiguation: null,
              kind: 'group',
              y0: 1967,
              slug: null,
            },
          ],
        }}
      />,
      { wrapper: MemoryRouter }
    );

    await userEvent.type(screen.getByRole('searchbox', { name: 'Chercher un artiste' }), 't');
    expect(onQueryChange).toHaveBeenCalledWith('t');
    // Each hit at its page's address: its slug, else its MBID while it has none.
    expect(screen.getByRole('link', { name: 'T. Rex' })).toHaveAttribute('href', '/artiste/t-rex');
    expect(screen.getByRole('link', { name: 'Tyrannosaurus Rex' })).toHaveAttribute(
      'href',
      `/artiste/${TYRANNOSAURUS}`
    );
  });

  it('says how to start, keeps the last answer while the next comes, and says when nothing matches', () => {
    const hit = {
      mbid: T_REX,
      name: 'T. Rex',
      disambiguation: 'glam rock band',
      kind: 'group' as const,
      y0: 1967,
      slug: null,
    };
    const view = (search: Parameters<typeof MusilogyHomeView>[0]['search']) => (
      <MusilogyHomeView query="t. r" onQueryChange={vi.fn()} search={search} />
    );
    const { rerender } = render(view({ status: 'idle' }), { wrapper: MemoryRouter });
    expect(screen.getByText("Tapez au moins deux lettres d'un nom.")).toBeInTheDocument();

    rerender(view({ status: 'searching', hits: [] }));
    expect(screen.getByRole('list', { busy: true })).toBeInTheDocument();

    rerender(view({ status: 'searching', hits: [hit] }));
    expect(screen.getByRole('link', { name: 'T. Rex' })).toBeInTheDocument();
    expect(screen.getByText('1967')).toBeInTheDocument();
    // MusicBrainz writes it in English: marked so, on a French page (WCAG 3.1.2).
    expect(screen.getByText('glam rock band')).toHaveAttribute('lang', 'en');

    rerender(view({ status: 'done', hits: [] }));
    expect(screen.getByText('Aucun artiste de ce nom.')).toBeInTheDocument();
  });

  it('lifts the field above an on-screen keyboard at the first letter of each focus only', async () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    const keyboard = (height: number) =>
      vi.stubGlobal('visualViewport', { height: window.innerHeight - height });
    render(<MusilogyHomeView query="" onQueryChange={vi.fn()} search={{ status: 'idle' }} />, {
      wrapper: MemoryRouter,
    });
    const field = screen.getByRole('searchbox', { name: 'Chercher un artiste' });

    keyboard(0);
    await userEvent.type(field, 'ab');
    expect(scrollIntoView).not.toHaveBeenCalled();

    keyboard(300);
    field.blur();
    await userEvent.type(field, 'cd');
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'start', behavior: 'smooth' });
    vi.unstubAllGlobals();
  });

  it('clears the search on its button', async () => {
    const onQueryChange = vi.fn();
    render(
      <MusilogyHomeView query="t. rex" onQueryChange={onQueryChange} search={{ status: 'idle' }} />,
      {
        wrapper: MemoryRouter,
      }
    );
    await userEvent.click(screen.getByRole('button', { name: 'Effacer la recherche' }));
    expect(onQueryChange).toHaveBeenCalledWith('');
  });
});
