// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import type { MusilogyArtist, MusilogyNeighbour } from '@aubesonore/shared-types/client';
import { cardLine, linkYears, MusilogyArtistView, MusilogyHomeView } from './MusilogyView';

const T_REX = 'c842d29f-a297-48cd-bb71-4f77fd672b16';

function neighbour(n: number, overrides: Partial<MusilogyNeighbour> = {}): MusilogyNeighbour {
  return {
    mbid: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    name: `Artist ${n}`,
    disambiguation: null,
    y0: 1960 + n,
    played: null,
    yEnd: null,
    score: 1000 - n,
    ...overrides,
  };
}

function artist(overrides: Partial<MusilogyArtist> = {}): MusilogyArtist {
  return {
    card: {
      mbid: T_REX,
      name: 'T. Rex',
      disambiguation: 'British glam rock band',
      y0: 1967,
      played: null,
      type: 'Group',
      country: 'GB',
      beginArea: 'London',
      y0Source: 'declared',
      yEnd: 1977,
      yEndSource: 'declared',
      ended: true,
      genres: ['glam rock', 'rock'],
      listeners: 31415,
      proximitySurveyed: true,
    },
    neighbours: {
      before: [neighbour(3, { name: 'The Kinks' })],
      during: [
        neighbour(4, { name: 'David Bowie', played: { id: 'a-bowie', slug: 'david-bowie' } }),
      ],
      after: [neighbour(14, { name: 'Ramones' })],
      undated: [],
    },
    influences: { cites: [], citedBy: [] },
    links: [
      {
        ...neighbour(20, { name: 'Marc Bolan' }),
        kind: 'members',
        yBegin: 1967,
        yEnd: 1977,
      },
    ],
    ...overrides,
  };
}

function show(state: Parameters<typeof MusilogyArtistView>[0]['state']) {
  return render(<MusilogyArtistView state={state} />, { wrapper: MemoryRouter });
}

describe('MusilogyArtistView', () => {
  it('places the artist among those before, alongside and after it', () => {
    show({ status: 'ready', artist: artist() });

    expect(screen.getByRole('heading', { level: 1, name: 'T. Rex' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Avant' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'The Kinks' })).toHaveAttribute(
      'href',
      `/musilogy/${neighbour(3).mbid}/the-kinks`
    );
    expect(screen.getByRole('link', { name: 'Ramones' })).toBeInTheDocument();
    expect(screen.getByText(/jamais une influence/)).toBeInTheDocument();
  });

  it('leads to the AubeSonore page of an artist the antenna played', () => {
    show({ status: 'ready', artist: artist() });

    expect(screen.getByRole('link', { name: 'Passé sur AubeSonore' })).toHaveAttribute(
      'href',
      '/artist/a-bowie/david-bowie'
    );
  });

  it('names each band link from the artist side', () => {
    show({ status: 'ready', artist: artist() });

    expect(screen.getByRole('heading', { name: 'Membres' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Marc Bolan' })).toBeInTheDocument();
  });

  it('says a section is not loaded yet rather than empty', () => {
    show({ status: 'ready', artist: artist({ neighbours: null, influences: null }) });

    expect(screen.getAllByText('Les proximités ne sont pas encore relevées.')).toHaveLength(3);
    expect(screen.getByText('Les influences ne sont pas encore chargées.')).toBeInTheDocument();
  });

  it('shows the closest first and opens the rest on demand', async () => {
    const before = Array.from({ length: 15 }, (_, i) => neighbour(i));
    show({
      status: 'ready',
      artist: artist({ neighbours: { before, during: [], after: [], undated: [] } }),
    });

    expect(screen.queryByRole('link', { name: 'Artist 14' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Voir 3 de plus' }));
    expect(screen.getByRole('link', { name: 'Artist 14' })).toBeInTheDocument();
  });

  it('says when Musilogy is not available, or the artist missing from its snapshot', () => {
    const { rerender } = show({ status: 'unavailable' });
    expect(
      screen.getByRole('heading', { name: "Musilogy n'est pas disponible." })
    ).toBeInTheDocument();

    rerender(<MusilogyArtistView state={{ status: 'missing' }} />);
    expect(screen.getByRole('heading', { name: 'Artiste absent.' })).toBeInTheDocument();
  });

  it('tells an artist the snapshot never asked about from one without neighbours', () => {
    const none = { before: [], during: [], after: [], undated: [] };
    const card = { ...artist().card, proximitySurveyed: false };
    show({ status: 'ready', artist: artist({ card, neighbours: none }) });

    expect(
      screen.getAllByText("Trop peu écouté pour qu'on lui connaisse des proches.")
    ).toHaveLength(3);
  });

  it('lists the neighbours whose start is unknown', () => {
    const undated = [neighbour(30, { name: 'Undated Band', y0: null })];
    show({
      status: 'ready',
      artist: artist({ neighbours: { before: [], during: [], after: [], undated } }),
    });

    expect(screen.getByRole('heading', { name: 'Dates inconnues' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Undated Band' })).toBeInTheDocument();
  });

  it('names no source, licence or tool, and links nowhere outside the site', () => {
    show({
      status: 'ready',
      artist: artist({
        influences: {
          cites: [{ ...neighbour(40, { name: 'Chuck Berry' }), statement: 'Q1$abc' }],
          citedBy: [],
        },
      }),
    });

    expect(screen.getByRole('link', { name: 'Chuck Berry' })).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/ListenBrainz|MusicBrainz|Wikidata|CC BY|CC0/);
    for (const link of screen.getAllByRole('link')) {
      expect(link.getAttribute('href')).toMatch(/^\//);
    }
  });
});

describe('linkYears', () => {
  it('gives the years in the group, open on the side it is not known', () => {
    const link = { ...neighbour(1), kind: 'members' as const, yBegin: 1971, yEnd: 1975 };
    expect(linkYears(link)).toBe('1971 – 1975');
    expect(linkYears({ ...link, yEnd: null })).toBe('1971 –');
    expect(linkYears({ ...link, yBegin: null, yEnd: null })).toBeNull();
  });
});

describe('cardLine', () => {
  it('states the type, where and when', () => {
    expect(cardLine(artist().card)).toBe('Groupe · London, Royaume-Uni · 1967 – 1977');
  });

  it('shows no end it can only infer, and says a start comes from the first album', () => {
    const card = { ...artist().card, y0Source: 'first_album', yEndSource: 'last_album' };
    expect(cardLine(card)).toBe('Groupe · London, Royaume-Uni · premier album en 1967');
    expect(cardLine({ ...card, yEndSource: 'declared' })).toBe(
      "Groupe · London, Royaume-Uni · premier album en 1967, jusqu'en 1977"
    );
  });
});

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
              type: 'Group',
              y0: 1967,
              listeners: 1,
            },
          ],
        }}
      />,
      { wrapper: MemoryRouter }
    );

    await userEvent.type(screen.getByRole('searchbox', { name: 'Chercher un artiste' }), 't');
    expect(onQueryChange).toHaveBeenCalledWith('t');
    expect(screen.getByRole('link', { name: 'T. Rex' })).toHaveAttribute(
      'href',
      `/musilogy/${T_REX}/t-rex`
    );
  });
});
