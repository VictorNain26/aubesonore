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
    rank: n + 1,
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
      kind: 'group',
      y0Source: 'declared',
      yEnd: 1977,
      yEndSource: 'declared',
      ended: true,
      genres: ['glam rock', 'rock'],
    },
    neighbours: {
      before: [neighbour(3, { name: 'The Kinks' })],
      during: [
        neighbour(4, { name: 'David Bowie', played: { id: 'a-bowie', slug: 'david-bowie' } }),
      ],
      after: [neighbour(14, { name: 'Ramones' })],
      undated: [],
    },
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
  it('places the close artists by decade, each a link to its page, with no lists apart', () => {
    show(artist());

    expect(screen.getByRole('heading', { name: 'Artistes proches' })).toBeInTheDocument();
    for (const link of screen.getAllByRole('link', { name: /The Kinks/ })) {
      expect(link).toHaveAttribute('href', `/artiste/${neighbour(3).mbid}`);
    }
    expect(screen.getAllByRole('link', { name: /Ramones/ }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('heading', { name: 'Avant' })).not.toBeInTheDocument();
    expect(screen.getByText(/par décennie de leurs débuts/)).toBeInTheDocument();
  });

  it('leads straight to the page of a neighbour the antenna played', () => {
    show(artist());

    for (const link of screen.getAllByRole('link', { name: /David Bowie/ })) {
      expect(link).toHaveAttribute('href', '/artiste/david-bowie');
    }
  });

  it('names each band link from the artist side', () => {
    show(artist());

    expect(screen.getByRole('heading', { name: 'Membres' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Marc Bolan' })).toBeInTheDocument();
  });

  it('leaves out every section with nothing in it, without a title over an absence', () => {
    show(artist({ neighbours: null }));

    expect(screen.queryByRole('heading', { name: 'Artistes proches' })).not.toBeInTheDocument();
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
    rerender(<Sections artist={{ ...person, card: { ...person.card, kind: 'person' } }} />);
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

  it('shows every close artist at once, with nothing to open', () => {
    const before = Array.from({ length: 40 }, (_, i) => neighbour(i));
    show(artist({ neighbours: { before, during: [], after: [], undated: [] } }));

    expect(screen.getAllByRole('link', { name: /Artist 39/ }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /Voir/ })).not.toBeInTheDocument();
  });

  it('names the close artists whose start is unknown', () => {
    const undated = [neighbour(30, { name: 'Undated Band', y0: null })];
    show(artist({ neighbours: { before: [neighbour(3)], during: [], after: [], undated } }));

    expect(screen.getByText('Débuts inconnus')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /Undated Band/ }).length).toBeGreaterThan(0);
  });

  it('names no source, licence or tool, and links nowhere outside the site', () => {
    show(artist());

    expect(screen.getAllByRole('link', { name: /Ramones/ }).length).toBeGreaterThan(0);
    expect(document.body).not.toHaveTextContent(/ListenBrainz|MusicBrainz|Wikidata|CC BY|CC0/);
    for (const link of screen.getAllByRole('link')) {
      expect(link.getAttribute('href')).toMatch(/^[/#]/);
    }
  });
});

describe('linkYears', () => {
  it('gives the years in the group, open on the side it is not known', () => {
    const link = { ...neighbour(1), yBegin: 1971, yEnd: 1975 };
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
              kind: 'group',
              y0: 1967,
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
      kind: 'group' as const,
      y0: 1967,
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
