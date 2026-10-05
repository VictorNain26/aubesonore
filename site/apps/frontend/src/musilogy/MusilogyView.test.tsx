// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import type { MusilogyArtist, MusilogyNeighbour } from '@aubesonore/shared-types/client';
import { linkYears, MusilogyHomeView, MusilogySections } from './MusilogyView';
import { coverOf, ReleasesSection } from './Releases';

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
    releases: [],
    bands: {
      members: [{ ...neighbour(20, { name: 'Marc Bolan' }), yBegin: 1967, yEnd: 1977 }],
      groups: [],
    },
    memberProjects: [],
    otherNames: [],
    ...overrides,
  };
}

/** What an artist page shows of Musilogy: the records, then where to go next. */
function Sections({ artist: shown }: { artist: MusilogyArtist }) {
  return (
    <>
      {shown.releases && shown.releases.length > 0 ? (
        <ReleasesSection releases={shown.releases} />
      ) : null}
      <MusilogySections artist={shown} thisYear={2026} />
    </>
  );
}

function show(shown: MusilogyArtist) {
  return render(<Sections artist={shown} />, { wrapper: MemoryRouter });
}

describe('MusilogySections', () => {
  it('places the artist among those before, alongside and after it', () => {
    show(artist());

    expect(screen.getByRole('heading', { name: 'Avant' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'The Kinks' })).toHaveAttribute(
      'href',
      `/artiste/${neighbour(3).mbid}`
    );
    expect(screen.getByRole('link', { name: 'Ramones' })).toBeInTheDocument();
    expect(screen.getByText(/placés selon leurs débuts/)).toBeInTheDocument();
  });

  it('leads straight to the page of a neighbour the antenna played', () => {
    show(artist());

    expect(screen.getByRole('link', { name: 'David Bowie' })).toHaveAttribute(
      'href',
      '/artiste/david-bowie'
    );
  });

  it('names each band link from the artist side', () => {
    show(artist());

    expect(screen.getByRole('heading', { name: 'Membres' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Marc Bolan' })).toBeInTheDocument();
  });

  it('leaves out every section with nothing in it, without a title over an absence', () => {
    show(artist({ neighbours: null, influences: null }));

    expect(screen.queryByRole('heading', { name: 'Avant' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Influences' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Groupes et projets' })).toBeInTheDocument();
  });

  it('shows the albums, then the EPs folded past the first eight, with their covers', async () => {
    const record = (n: number, type: 'album' | 'ep', extra = {}) => ({
      mbid: `rg-${n}`,
      title: `Record ${n}`,
      type,
      soundtrack: false,
      remix: false,
      year: 1960 + n,
      ...extra,
    });
    const eps = Array.from({ length: 10 }, (_, i) => record(10 + i, 'ep'));
    show(artist({ releases: [record(1, 'album', { soundtrack: true }), ...eps] }));

    expect(screen.getByRole('heading', { name: 'Albums et EP' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Albums' })).toBeInTheDocument();
    expect(screen.getByText('1961 · bande originale')).toBeInTheDocument();
    expect(coverOf(record(1, 'album'))).toBe(
      'https://coverartarchive.org/release-group/rg-1/front-250'
    );
    expect(screen.queryByText('Record 19')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Voir 2 de plus' }));
    expect(screen.getByText('Record 19')).toBeInTheDocument();
  });

  it("calls a person's groups its bands, and a group's its joint projects", () => {
    const uilab = { ...neighbour(60, { name: 'Uilab' }), yBegin: 1997, yEnd: 1997 };
    const { rerender } = show(artist({ bands: { members: [], groups: [uilab] } }));
    expect(screen.getByRole('heading', { name: 'Projets communs' })).toBeInTheDocument();

    const person = artist({ bands: { members: [], groups: [uilab] } });
    rerender(<Sections artist={{ ...person, card: { ...person.card, type: 'Person' } }} />);
    expect(screen.getByRole('heading', { name: 'Groupes' })).toBeInTheDocument();
  });

  it("names who leads to each member's project, and what each other name is", () => {
    show(
      artist({
        memberProjects: [{ ...neighbour(50, { name: 'Shagrat' }), via: ['Steve Peregrine Took'] }],
        otherNames: [{ ...neighbour(51, { name: 'Tyrannosaurus Rex' }), kind: 'former' }],
      })
    );

    expect(screen.getByRole('heading', { name: 'Projets des membres' })).toBeInTheDocument();
    expect(screen.getByText('avec Steve Peregrine Took')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Tyrannosaurus Rex' })).toBeInTheDocument();
    expect(screen.getByText('ancien nom')).toBeInTheDocument();
  });

  it('shows the closest first and opens the rest on demand', async () => {
    const before = Array.from({ length: 15 }, (_, i) => neighbour(i));
    show(artist({ neighbours: { before, during: [], after: [], undated: [] } }));

    expect(screen.queryByRole('link', { name: 'Artist 14' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Voir 3 de plus' }));
    expect(screen.getByRole('link', { name: 'Artist 14' })).toBeInTheDocument();
  });

  it('shows influences only when the artist declared some', () => {
    const { rerender } = show(artist());
    expect(screen.queryByRole('heading', { name: 'Influences' })).not.toBeInTheDocument();

    rerender(
      <Sections
        artist={artist({
          influences: {
            cites: [{ ...neighbour(40, { name: 'Elvis' }), statement: 'Q1$abc' }],
            citedBy: [],
          },
        })}
      />
    );
    expect(screen.getByRole('heading', { name: 'Influences' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Elvis' })).toBeInTheDocument();
  });

  it('lists the neighbours whose start is unknown', () => {
    const undated = [neighbour(30, { name: 'Undated Band', y0: null })];
    show(artist({ neighbours: { before: [], during: [], after: [], undated } }));

    expect(screen.getByRole('heading', { name: 'Débuts inconnus' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Undated Band' })).toBeInTheDocument();
  });

  it('names no source, licence or tool, and links nowhere outside the site', () => {
    show(
      artist({
        influences: {
          cites: [{ ...neighbour(40, { name: 'Chuck Berry' }), statement: 'Q1$abc' }],
          citedBy: [],
        },
      })
    );

    expect(screen.getByRole('link', { name: 'Chuck Berry' })).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/ListenBrainz|MusicBrainz|Wikidata|CC BY|CC0/);
    for (const link of screen.getAllByRole('link')) {
      expect(link.getAttribute('href')).toMatch(/^[/#]/);
    }
  });
});

describe('linkYears', () => {
  it('gives the years in the group, open on the side it is not known', () => {
    const link = { ...neighbour(1), kind: 'members' as const, yBegin: 1971, yEnd: 1975 };
    expect(linkYears(link)).toBe('de 1971 à 1975');
    expect(linkYears({ ...link, yEnd: null })).toBe('depuis 1971');
    expect(linkYears({ ...link, yBegin: null })).toBe("jusqu'en 1975");
    expect(linkYears({ ...link, yBegin: null, yEnd: null })).toBeNull();
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
      `/artiste/${T_REX}`
    );
  });

  it('says how to start, keeps the last answer while the next comes, and says when nothing matches', () => {
    const hit = {
      mbid: T_REX,
      name: 'T. Rex',
      disambiguation: 'glam rock band',
      type: 'Group',
      y0: 1967,
      listeners: 1,
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

    rerender(view({ status: 'done', hits: [] }));
    expect(screen.getByText('Aucun artiste de ce nom.')).toBeInTheDocument();
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
