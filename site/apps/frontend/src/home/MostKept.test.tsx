// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import type { TrendEntry } from '@aubesonore/shared-types/client';
import { MostKeptView } from './MostKept';

const entry = (title: string, likes: number, values: Partial<TrendEntry> = {}): TrendEntry => ({
  title,
  artist: 'Artiste',
  artworkUrl: null,
  likes,
  artistPage: null,
  ...values,
});

const wrapper = MemoryRouter;

describe('MostKeptView', () => {
  it("shows the week's kept tracks in the order the ranking gives, without tabs", () => {
    render(<MostKeptView week={[entry('Nüchtern', 3), entry('Oh No', 1)]} status="ready" />, {
      wrapper,
    });

    expect(screen.getByRole('heading', { name: 'Les plus gardés de la semaine' })).toBeVisible();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      expect.stringContaining('Nüchtern'),
      expect.stringContaining('Oh No'),
    ]);
  });

  it('keeps every track of the week, however few times it was kept, and every one sent', () => {
    const week = Array.from({ length: 10 }, (_, i) => entry(`Titre ${i}`, 1));
    render(<MostKeptView week={week} status="ready" />, { wrapper });
    expect(screen.getAllByRole('listitem')).toHaveLength(10);
    // No count: a row of covers, not a scoreboard.
    expect(screen.queryByText(/gardé \d+ fois/)).not.toBeInTheDocument();
  });

  it("leads to the page of a track's artist, under that page's name", () => {
    const week = [
      entry('Get Lucky', 4, {
        artist: 'Daft Punk feat. Pharrell Williams',
        artistPage: { slug: 'daft-punk', name: 'Daft Punk' },
      }),
      entry('Nightcall', 2, { artist: 'Kavinsky' }),
    ];
    render(<MostKeptView week={week} status="ready" />, { wrapper });

    expect(screen.getByRole('link', { name: 'Get Lucky, Daft Punk' })).toHaveAttribute(
      'href',
      '/artiste/daft-punk'
    );
    // An artist without a page stays text: no link rather than a dead one.
    expect(screen.queryByRole('link', { name: /Nightcall/ })).not.toBeInTheDocument();
  });

  it('lets the keyboard reach the row and scroll it', async () => {
    render(<MostKeptView week={[entry('Nüchtern', 3)]} status="ready" />, { wrapper });
    const row = screen.getByRole('list');
    await userEvent.tab();
    expect(row).toHaveFocus();
    expect(row).toHaveAccessibleName('Les plus gardés de la semaine');
  });

  it("fetches its covers after the page's other images", () => {
    const artworkUrl = 'https://radio.aubesonore.fr/api/station/aubesonore/art/b2-1.jpg';
    render(<MostKeptView week={[entry('Nüchtern', 3, { artworkUrl })]} status="ready" />, {
      wrapper,
    });
    const img = screen.getByRole('presentation');
    expect(img).toHaveAttribute('fetchpriority', 'low');
    // 104 px beside the cover on air, 120 px on a phone: the 192 px file at most on a dense screen.
    expect(img).toHaveAttribute(
      'sizes',
      '(min-width: 48rem) and (orientation: landscape) 6.5rem, 7.5rem'
    );
  });

  it('shows nothing for an empty week', () => {
    const { container } = render(<MostKeptView week={[]} status="ready" />, { wrapper });
    expect(container).toBeEmptyDOMElement();
  });

  it('says the ranking is unavailable on error', () => {
    render(<MostKeptView week={null} status="error" />, { wrapper });
    expect(screen.getByText('Le classement est indisponible pour l’instant.')).toBeInTheDocument();
  });
});
