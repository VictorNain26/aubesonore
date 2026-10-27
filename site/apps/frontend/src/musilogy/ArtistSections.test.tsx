// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import type { MusilogyArtist, MusilogyNeighbour } from '@aubesonore/shared-types/client';
import { linkYears, MusilogySections } from './ArtistSections';
import { coverOf, ReleasesSection } from './Releases';

const T_REX = 'c842d29f-a297-48cd-bb71-4f77fd672b16';

function neighbour(n: number, overrides: Partial<MusilogyNeighbour> = {}): MusilogyNeighbour {
  return {
    mbid: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    name: `Artist ${n}`,
    disambiguation: null,
    y0: 1960 + n,
    played: null,
    slug: null,
    yEnd: null,
    ended: false,
    rank: n + 1,
    term: 'Glam Rock',
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
      slug: null,
      kind: 'group',
      y0Source: 'declared',
      yEnd: 1977,
      yEndSource: 'declared',
      ended: true,
      styles: ['Glam', 'Rock & Roll'],
    },
    sameSound: [
      neighbour(3, { name: 'The Kinks' }),
      neighbour(4, {
        name: 'David Bowie',
        played: { id: 'a-bowie', slug: 'david-bowie' },
        slug: 'david-bowie',
      }),
      neighbour(14, { name: 'Ramones', term: 'Punk' }),
    ],
    colisten: [
      neighbour(5, { name: 'Gary Glitter', term: null }),
      neighbour(6, { name: 'Slade', term: null }),
    ],
    credits: [],
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

/** The page, its filiation tab open. */
function showFiliation(shown: MusilogyArtist) {
  const view = show(shown);
  fireEvent.click(screen.getByRole('tab', { name: 'Filiation' }));
  return view;
}

describe('MusilogySections', () => {
  it('lists the close artists by rank, each a link to its page, the sound they share said once', () => {
    show(artist());

    expect(screen.getByRole('heading', { name: 'Artistes proches' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'The Kinks' })).toHaveAttribute(
      'href',
      `/artiste/${neighbour(3).mbid}`
    );
    expect(screen.getByText('Le même son, surtout glam rock.')).toBeInTheDocument();
    // The one that differs says what it shares; the years, written on the bars, are said in words
    // to a screen reader.
    expect(screen.getByText('punk')).toBeInTheDocument();
    expect(screen.getByText('depuis 1974')).toBeInTheDocument();
    expect(screen.getByText('depuis 1963')).toBeInTheDocument();
    // The artist itself leads the timeline, drawn for the eye, and is no link to its own page.
    expect(within(screen.getByRole('tabpanel')).getByText('T. Rex')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'T. Rex' })).not.toBeInTheDocument();
  });

  it('leads straight to the page of a neighbour the antenna played, at its slug', () => {
    show(artist());

    expect(screen.getByRole('link', { name: 'David Bowie' })).toHaveAttribute(
      'href',
      '/artiste/david-bowie'
    );
  });

  it('leads to the page of a neighbour never played at its slug too, else at its MBID', () => {
    const named = neighbour(40, { name: 'Gorillaz', slug: 'gorillaz' });
    const unnamed = neighbour(41, { name: 'Unnamed' });
    show(artist({ sameSound: [named, unnamed] }));

    expect(screen.getByRole('link', { name: 'Gorillaz' })).toHaveAttribute(
      'href',
      '/artiste/gorillaz'
    );
    expect(screen.getByRole('link', { name: 'Unnamed' })).toHaveAttribute(
      'href',
      `/artiste/${unnamed.mbid}`
    );
  });

  it('names each band link from the artist side', () => {
    showFiliation(artist());

    expect(screen.getByRole('heading', { name: 'Membres' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Marc Bolan' })).toBeInTheDocument();
  });

  it('leaves out every tab with nothing in it, and opens the first one left', () => {
    show(artist({ sameSound: null, colisten: [] }));

    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Filiation']);
    expect(screen.getByRole('tab', { name: 'Filiation' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('heading', { name: 'Membres' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Influences' })).not.toBeInTheDocument();
  });

  it('leaves out the section, title and all, when no tab has anything', () => {
    show(
      artist({
        sameSound: [],
        colisten: null,
        bands: { members: [], groups: [] },
        memberProjects: [],
        otherNames: [],
        credits: [],
      })
    );

    expect(screen.queryByRole('heading', { name: 'Artistes proches' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
  });

  it('shows one tab at a time, the same sound first, each saying what its list is', () => {
    show(artist());

    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Même son',
      'Écoutés ensemble',
      'Filiation',
    ]);
    expect(screen.getByRole('link', { name: 'The Kinks' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Slade' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Écoutés ensemble' }));

    expect(screen.getByText('Ceux que le même public écoute.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Slade' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'The Kinks' })).not.toBeInTheDocument();
    // No style under a name the same public brings, nor said above them.
    expect(within(screen.getByRole('tabpanel')).queryByText(/glam rock/)).not.toBeInTheDocument();
  });

  it('gives the artists credited together in the filiation, the count of records said', () => {
    showFiliation(
      artist({
        credits: [
          { ...neighbour(50, { name: 'Tony Visconti' }), records: 4 },
          { ...neighbour(51, { name: 'Elton John' }), records: 1 },
        ],
      })
    );

    expect(screen.getByRole('heading', { name: 'Crédités ensemble' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Tony Visconti' })).toBeInTheDocument();
    expect(screen.getByText('4 disques')).toBeInTheDocument();
    expect(screen.getByText('1 disque')).toBeInTheDocument();
  });

  it('shows the albums, then the EPs folded past the first six, how many there are and how many remain', async () => {
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

    const records = screen.getByRole('region', { name: 'Albums et EP' });
    // The count beside the title: every album and EP.
    expect(within(records).getByText('11')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Albums' })).toBeInTheDocument();
    expect(screen.getByText('1961 · bande originale')).toBeInTheDocument();
    expect(coverOf(record(1, 'album'))).toBe(
      'https://coverartarchive.org/release-group/rg-1/front-250'
    );
    expect(screen.getByText('Record 15')).toBeInTheDocument();
    expect(screen.queryByText('Record 16')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Voir les 4 autres' }));
    expect(screen.getByText('Record 19')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Voir (les|l’)/ })).not.toBeInTheDocument();
  });

  it('says the one record left, and shows the rest at once up to sixty', async () => {
    const albums = (count: number) =>
      Array.from({ length: count }, (_, i) => ({
        mbid: `rg-a${i}`,
        title: `Album ${i}`,
        type: 'album' as const,
        soundtrack: false,
        remix: false,
        year: 2000 - i,
      }));
    const { unmount } = show(artist({ releases: albums(13) }));
    await userEvent.click(screen.getByRole('button', { name: 'Voir l’autre' }));
    expect(screen.getByText('Album 12')).toBeInTheDocument();
    unmount();

    show(artist({ releases: albums(72) }));
    expect(screen.queryByText('Album 12')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Voir les 60 autres' }));
    expect(screen.getByText('Album 71')).toBeInTheDocument();
  });

  it("shows a composer's thousands of albums a step at a time, saying how many remain", async () => {
    const albums = Array.from({ length: 200 }, (_, i) => ({
      mbid: `rg-a${i}`,
      title: `Album ${i}`,
      type: 'album' as const,
      soundtrack: false,
      remix: false,
      year: 2000 - i,
    }));
    show(artist({ releases: albums }));

    expect(screen.getByText('Album 11')).toBeInTheDocument();
    expect(screen.queryByText('Album 12')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Voir les 60 suivants sur 188' }));
    expect(screen.getByText('Album 71')).toBeInTheDocument();
    expect(screen.queryByText('Album 72')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Voir les 60 suivants sur 128' }));
    await userEvent.click(screen.getByRole('button', { name: 'Voir les 60 suivants sur 68' }));
    await userEvent.click(screen.getByRole('button', { name: 'Voir les 8 autres' }));
    expect(screen.getByText('Album 199')).toBeInTheDocument();
  });

  it("calls a person's groups its bands, and a group's its joint projects", () => {
    const uilab = { ...neighbour(60, { name: 'Uilab' }), yBegin: 1997, yEnd: 1997 };
    const { rerender } = showFiliation(artist({ bands: { members: [], groups: [uilab] } }));
    expect(screen.getByRole('heading', { name: 'Projets communs' })).toBeInTheDocument();

    const person = artist({ bands: { members: [], groups: [uilab] } });
    rerender(<Sections artist={{ ...person, card: { ...person.card, kind: 'person' } }} />);
    expect(screen.getByRole('heading', { name: 'Groupes' })).toBeInTheDocument();
  });

  it("says a person's filiation starts with its bands, a group's with its members", () => {
    const { rerender } = showFiliation(artist());
    expect(
      screen.getByText('Ses membres, ses autres noms, ceux qui partagent ses disques.')
    ).toBeInTheDocument();

    const person = artist();
    rerender(<Sections artist={{ ...person, card: { ...person.card, kind: 'person' } }} />);
    expect(
      screen.getByText('Ses groupes, ses autres noms, ceux qui partagent ses disques.')
    ).toBeInTheDocument();
  });

  it('puts the other groups under the member who leads there, and says what each other name is', () => {
    const took = { ...neighbour(52, { name: 'Steve Peregrine Took' }), yBegin: 1967, yEnd: 1969 };
    showFiliation(
      artist({
        bands: {
          members: [{ ...neighbour(20, { name: 'Marc Bolan' }), yBegin: 1967, yEnd: 1977 }, took],
          groups: [],
        },
        memberProjects: [
          { ...neighbour(50, { name: 'Shagrat' }), via: ['Steve Peregrine Took'] },
          { ...neighbour(53, { name: 'John’s Children' }), via: ['Marc Bolan'] },
        ],
        otherNames: [{ ...neighbour(51, { name: 'Tyrannosaurus Rex' }), kind: 'former' }],
      })
    );

    const rowOf = (name: string) =>
      screen
        .getAllByRole('listitem')
        .find((row) => within(row).queryByRole('link', { name })) as HTMLElement;
    expect(
      within(rowOf('Steve Peregrine Took')).getByRole('link', { name: 'Shagrat' })
    ).toBeTruthy();
    expect(within(rowOf('Steve Peregrine Took')).getByText('de 1967 à 1969')).toBeTruthy();
    expect(within(rowOf('Marc Bolan')).queryByRole('link', { name: 'Shagrat' })).toBeNull();
    expect(within(rowOf('Marc Bolan')).getByRole('link', { name: 'John’s Children' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Projets des membres' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Tyrannosaurus Rex' })).toBeInTheDocument();
    expect(screen.getByText('ancien nom')).toBeInTheDocument();
  });

  it('puts a project two members share under both, folds a long line, and says who each member is', async () => {
    const project = (n: number, via: string[]) => ({
      ...neighbour(100 + n, { name: `Project ${n}` }),
      via,
    });
    showFiliation(
      artist({
        bands: {
          members: [
            {
              ...neighbour(20, { name: 'Ann', disambiguation: 'drummer' }),
              yBegin: null,
              yEnd: null,
            },
            { ...neighbour(21, { name: 'Bob' }), yBegin: null, yEnd: null },
          ],
          groups: [],
        },
        memberProjects: [
          project(0, ['Ann', 'Bob']),
          ...Array.from({ length: 9 }, (_, i) => project(i + 1, ['Bob'])),
        ],
      })
    );

    const rowOf = (name: string) =>
      screen
        .getAllByRole('listitem')
        .find((row) => within(row).queryByRole('link', { name })) as HTMLElement;
    expect(within(rowOf('Ann')).getByRole('link', { name: 'Project 0' })).toBeTruthy();
    // MusicBrainz writes it in English: marked so, on a French page (WCAG 3.1.2).
    expect(within(rowOf('Ann')).getByText('drummer')).toHaveAttribute('lang', 'en');
    expect(within(rowOf('Ann')).getByText('aussi dans')).toBeTruthy();
    expect(within(rowOf('Bob')).getByRole('link', { name: 'Project 0' })).toBeTruthy();
    expect(within(rowOf('Bob')).queryByRole('link', { name: 'Project 9' })).toBeNull();
    await userEvent.click(within(rowOf('Bob')).getByRole('button', { name: 'Voir 2 de plus' }));
    expect(within(rowOf('Bob')).getByRole('link', { name: 'Project 9' })).toBeTruthy();
  });

  it('ties no project to a name two members share, and says who leads there', () => {
    const twin = (n: number) => ({
      ...neighbour(n, { name: 'John Smith' }),
      yBegin: null,
      yEnd: null,
    });
    showFiliation(
      artist({
        bands: { members: [twin(30), twin(31)], groups: [] },
        memberProjects: [{ ...neighbour(50, { name: 'Shagrat' }), via: ['John Smith'] }],
      })
    );

    expect(screen.queryByText('aussi dans')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Projets des membres' })).toBeInTheDocument();
    expect(screen.getByText('avec John Smith')).toBeInTheDocument();
  });

  it("gives a person's groups on one line, a single year alone, folded past twelve", () => {
    const group = (n: number, yBegin: number | null = null, yEnd: number | null = null) => ({
      ...neighbour(60 + n, { name: `Group ${n}` }),
      yBegin,
      yEnd,
    });
    const person = artist({
      bands: {
        members: [],
        groups: [group(0, 1997, 1997), ...Array.from({ length: 13 }, (_, i) => group(i + 1))],
      },
    });
    showFiliation({ ...person, card: { ...person.card, kind: 'person' } });

    expect(screen.getByText('1997')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Group 13' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Voir 2 de plus' })).toBeInTheDocument();
  });

  it('shows every close artist at once, with nothing to open', () => {
    show(artist({ sameSound: Array.from({ length: 8 }, (_, i) => neighbour(i)) }));

    expect(screen.getAllByRole('listitem').length).toBeGreaterThanOrEqual(8);
    expect(screen.getByRole('link', { name: 'Artist 7' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Voir/ })).not.toBeInTheDocument();
  });

  it('keeps a close artist whose start is unknown in its rank, said so', () => {
    show(artist({ sameSound: [neighbour(3), neighbour(30, { name: 'Undated Band', y0: null })] }));

    expect(screen.getByRole('link', { name: 'Undated Band' })).toBeInTheDocument();
    expect(screen.getByText('début inconnu')).toBeInTheDocument();
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
    expect(linkYears({ ...link, yBegin: null })).toBe('jusqu’en 1975');
    expect(linkYears({ ...link, yEnd: 1971 })).toBe('1971');
    expect(linkYears({ ...link, yBegin: null, yEnd: null })).toBeNull();
  });
});
