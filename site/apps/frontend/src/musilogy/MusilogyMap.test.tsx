// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import type { MusilogyArtist, MusilogyNeighbour } from '@aubesonore/shared-types/client';
import { byDecade, closestOf, MusilogyMap } from './MusilogyMap';

function neighbour(n: number, y0: number | null, score = 1000 - n): MusilogyNeighbour {
  return {
    mbid: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    name: `Artist number ${n}`,
    disambiguation: null,
    y0,
    played: null,
    yEnd: null,
    score,
  };
}

function artist(
  neighbours: MusilogyArtist['neighbours'],
  card: Partial<MusilogyArtist['card']> = {}
): MusilogyArtist {
  return {
    card: {
      mbid: 'c842d29f-a297-48cd-bb71-4f77fd672b16',
      name: 'T. Rex',
      disambiguation: null,
      y0: 1967,
      played: null,
      kind: 'group',
      y0Source: 'declared',
      yEnd: 1977,
      yEndSource: 'declared',
      ended: true,
      genres: [],
      ...card,
    },
    neighbours,
    influences: null,
    releases: [],
    bands: { members: [], groups: [] },
    memberProjects: [],
    otherNames: [],
  };
}

const around = (before: MusilogyNeighbour[], undated: MusilogyNeighbour[] = []) => ({
  before,
  during: [],
  after: [],
  undated,
});

describe('closestOf', () => {
  it('puts every neighbour in one line, the closest first, marked and tiered', () => {
    const shown = {
      ...artist({
        before: [neighbour(1, 1950, 10)],
        during: [neighbour(2, 1968, 30)],
        after: [neighbour(3, 1980, 20)],
        undated: [neighbour(4, null, 5)],
      }),
      influences: {
        cites: [{ ...neighbour(1, 1950), statement: 'Q1$a' }],
        citedBy: [{ ...neighbour(3, 1980), statement: 'Q2$b' }],
      },
    };

    expect(closestOf(shown).map((close) => [close.artist.name, close.mark])).toEqual([
      ['Artist number 2', null],
      ['Artist number 3', 'inspired'],
      ['Artist number 1', 'influence'],
      ['Artist number 4', null],
    ]);
  });

  it('sets the ten closest apart, then the next twenty, then the rest', () => {
    const crowd = Array.from({ length: 40 }, (_, i) => neighbour(i, 1970));
    const tiers = closestOf(artist(around(crowd))).map((close) => close.tier);

    expect(tiers.filter((tier) => tier === 1)).toHaveLength(10);
    expect(tiers.filter((tier) => tier === 2)).toHaveLength(20);
    expect(tiers.filter((tier) => tier === 3)).toHaveLength(10);
  });
});

describe('byDecade', () => {
  it('groups every neighbour by the decade it started in, each decade by year', () => {
    const { decades, undated } = byDecade(
      artist(
        around(
          [neighbour(1, 1958, 10), neighbour(2, 1972, 50), neighbour(3, 1975, 90)],
          [neighbour(4, null)]
        )
      ),
      2026
    );

    expect(decades.map((decade) => [decade.decade, decade.own])).toEqual([
      [1950, false],
      [1960, true],
      [1970, true],
    ]);
    expect(decades[2]?.close.map((close) => close.artist.name)).toEqual([
      'Artist number 2',
      'Artist number 3',
    ]);
    expect(undated.map((close) => close.artist.name)).toEqual(['Artist number 4']);
  });

  it("marks an active artist's decades up to this year, leaving out the empty ones but its first", () => {
    const { decades } = byDecade(
      artist(around([neighbour(1, 2016), neighbour(2, 2021)]), {
        y0: 2004,
        yEnd: 2012,
        ended: false,
      }),
      2026
    );

    expect(decades.map((decade) => [decade.decade, decade.own])).toEqual([
      [2000, true],
      [2010, true],
      [2020, true],
    ]);
    expect(
      byDecade(artist(around([neighbour(1, 2016)]), { y0: 2004, ended: false }), 2026).decades.map(
        (decade) => decade.decade
      )
    ).toEqual([2000, 2010]);
  });

  it('gives a fuller decade more columns, fifteen names each', () => {
    const crowd = Array.from({ length: 40 }, (_, i) => neighbour(i, 1970 + (i % 10)));
    const { decades } = byDecade(artist(around(crowd)), 2026);

    expect(decades.find((decade) => decade.decade === 1970)?.columns).toBe(3);
    expect(decades.find((decade) => decade.decade === 1960)?.columns).toBe(1);
  });
});

function showMap(shown: MusilogyArtist) {
  return render(<MusilogyMap artist={shown} thisYear={2026} />, { wrapper: MemoryRouter });
}

describe('MusilogyMap', () => {
  it('shows every neighbour at once, each a link to its page with its year', () => {
    const crowd = Array.from({ length: 100 }, (_, i) => neighbour(i, 1950 + (i % 70)));
    showMap(artist(around(crowd)));

    // Side by side and one under the other are both in the page: a container query shows one.
    expect(screen.getAllByRole('link')).toHaveLength(200);
    const [first] = screen.getAllByRole('link', { name: /^Artist number 1, 1951/ });
    expect(first).toHaveAttribute('href', `/artiste/${neighbour(1, 1951).mbid}`);
  });

  it('names each decade and sets the artist in the first of its own', () => {
    showMap(artist(around([neighbour(1, 1958), neighbour(2, 1972)])));
    const [columns] = screen.getAllByRole('region', { name: 'Années 1960' });

    expect(within(columns!).getByText('T. Rex')).toBeInTheDocument();
    expect(screen.getAllByRole('region', { name: 'Années 1950' })).toHaveLength(2);
    expect(screen.queryByRole('region', { name: 'Années 1980' })).not.toBeInTheDocument();
  });

  it('closes on the neighbours whose start is unknown', () => {
    showMap(artist(around([neighbour(1, 1960)], [neighbour(2, null)])));

    expect(
      within(screen.getByRole('region', { name: 'Débuts inconnus' })).getByRole('link', {
        name: /Artist number 2/,
      })
    ).toBeInTheDocument();
  });

  it('says beside a neighbour that it is also a declared influence', () => {
    showMap({
      ...artist(around([neighbour(1, 1960)])),
      influences: { cites: [{ ...neighbour(1, 1960), statement: 'Q1$a' }], citedBy: [] },
    });

    expect(screen.getAllByText(/l'a influencé/)).toHaveLength(2);
  });

  it('shows nothing without a neighbour', () => {
    const { container } = showMap(artist(around([])));

    expect(container).toBeEmptyDOMElement();
  });
});
