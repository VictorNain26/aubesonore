// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import type { TrendEntry } from '@aubesonore/shared-types/client';
import { MostKept, MostKeptView } from './MostKept';

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
  it('ranks the week, then switches to all time', async () => {
    render(
      <MostKeptView
        trends={{
          week: [entry('Nüchtern', 3), entry('Oh No', 1)],
          allTime: [entry('Sleep Apnea', 9)],
        }}
      />,
      { wrapper }
    );

    expect(screen.getByText('Nüchtern')).toBeInTheDocument();
    expect(screen.getByText('01')).toBeInTheDocument();
    expect(screen.getByText('gardé 3 fois')).toBeInTheDocument();
    // A single keep is not shown: it says how quiet it is, not what people like.
    expect(screen.queryByText(/gardé 1 fois/)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: 'Depuis le début' }));
    expect(await screen.findByText('Sleep Apnea')).toBeInTheDocument();
  });

  it("leads to the page of a track's artist, under that page's name", () => {
    const week = [
      entry('Get Lucky', 4, {
        artist: 'Daft Punk feat. Pharrell Williams',
        artistPage: { slug: 'daft-punk', name: 'Daft Punk' },
      }),
      entry('Nightcall', 2, { artist: 'Kavinsky' }),
    ];
    render(<MostKeptView trends={{ week, allTime: [] }} />, { wrapper });

    expect(screen.getByRole('link', { name: 'Daft Punk' })).toHaveAttribute(
      'href',
      '/artiste/daft-punk'
    );
    // An artist without a page stays text: no link rather than a dead one.
    expect(screen.getByText('Kavinsky')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Kavinsky' })).not.toBeInTheDocument();
  });

  it('shows at most five tracks', () => {
    const week = Array.from({ length: 8 }, (_, i) => entry(`Titre ${i}`, 8 - i));
    render(<MostKeptView trends={{ week, allTime: [] }} />, { wrapper });
    expect(screen.getAllByRole('listitem')).toHaveLength(5);
  });
});

describe('MostKept', () => {
  const ranking = (likes: number[]) => ({
    week: likes.map((n, i) => entry(`Titre ${i}`, n)),
    allTime: likes.map((n, i) => entry(`Titre ${i}`, n + 1)),
  });

  it('stays off the page while no track of the week was kept three times: it would rank nothing', () => {
    const { container } = render(<MostKept trends={ranking([2, 1, 1])} />, { wrapper });
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the ranking once a track of the week was kept three times', () => {
    render(<MostKept trends={ranking([3, 1])} />, { wrapper });
    expect(screen.getByRole('heading', { name: 'Les plus gardés' })).toBeInTheDocument();
  });

  it('stays off the page while the ranking has not come, or did not answer', () => {
    const view = render(<MostKept trends={null} />, { wrapper });
    expect(view.container).toBeEmptyDOMElement();
    view.rerender(<MostKept trends="failed" />);
    expect(view.container).toBeEmptyDOMElement();
  });
});
