// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import type { MusilogyArtist, MusilogyNeighbour } from '@aubesonore/shared-types/client';
import { closestOf, layoutTimeline, MusilogyMap } from './MusilogyMap';

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

function layoutOf(shown: MusilogyArtist, count = 10) {
  return layoutTimeline(shown.card, closestOf(shown).slice(0, count), 2026);
}

describe('closestOf', () => {
  it('puts every neighbour in one line, the closest first, marking declared influences', () => {
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
});

describe('layoutTimeline', () => {
  it('draws nothing without a start year for the artist or a dated neighbour', () => {
    expect(layoutOf(artist(around([neighbour(1, 1960)]), { y0: null }))).toBeNull();
    expect(layoutOf(artist(null))).toBeNull();
    expect(layoutOf(artist(around([], [neighbour(1, null)])))).toBeNull();
  });

  it('spans the artist and most neighbours by whole decades, one far older at the edge', () => {
    const years = [1958, 1964, 1965, 1966, 1968, 1970, 1971, 1972, 1973, 1975];
    const layout = layoutOf(artist(around(years.map((year, i) => neighbour(i, year)))));

    expect(layout?.ticks.map((tick) => tick.year)).toEqual([1960, 1970, 1980]);
    const oldest = layout?.placed.find((one) => one.artist.y0 === 1958);
    expect(oldest?.edge).toBe(true);
    expect(oldest?.x).toBe(layout?.ticks[0]?.x);
    expect(layout?.placed.filter((one) => one.edge)).toHaveLength(1);
  });

  it('runs an active artist to this year, whatever its last album says', () => {
    const layout = layoutOf(
      artist(around([neighbour(1, 2016)]), {
        y0: 2019,
        yEnd: 2022,
        yEndSource: 'last_album',
        ended: false,
      })
    );

    expect(layout?.ticks.map((tick) => tick.year)).toEqual([2010, 2020, 2030]);
    expect(layout?.span.x1).toBeGreaterThan(layout?.ticks[1]?.x ?? Infinity);
  });

  it('never sets a less close neighbour nearer the axis than its rank allows', () => {
    const crowd = Array.from({ length: 10 }, (_, i) => neighbour(i, 1965));
    const layout = layoutOf(artist(around(crowd)));
    const distance = (n: number) =>
      Math.abs(layout?.placed.find((one) => one.artist.name === `Artist number ${n}`)?.row ?? 0);

    expect([0, 1, 2].map(distance).every((d) => d >= 1)).toBe(true);
    expect([3, 4, 5].map(distance).every((d) => d >= 2)).toBe(true);
    expect([6, 7, 8, 9].map(distance).every((d) => d >= 3)).toBe(true);
  });

  it('places every neighbour shown, no two labels over each other on a row', () => {
    const crowd = Array.from({ length: 30 }, (_, i) => neighbour(i, 1965 + (i % 3)));
    const layout = layoutOf(artist(around(crowd)), 30);
    const rows = new Map<number, Array<[number, number]>>();
    for (const one of layout?.placed ?? []) {
      const taken = rows.get(one.row) ?? [];
      expect(taken.every(([a, b]) => one.span[1] < a || one.span[0] > b)).toBe(true);
      expect(one.span[0]).toBeGreaterThanOrEqual(0);
      expect(one.span[1]).toBeLessThanOrEqual(960);
      rows.set(one.row, [...taken, one.span]);
    }
    expect(layout?.placed).toHaveLength(30);
    expect(rows.has(0)).toBe(false);
  });
});

function showMap(shown: MusilogyArtist) {
  return render(<MusilogyMap artist={shown} thisYear={2026} />, { wrapper: MemoryRouter });
}

describe('MusilogyMap', () => {
  it('names each neighbour as a link to its page, with its year', () => {
    showMap(artist(around([neighbour(1, 1960)])));

    // The map and the list are both in the page; a container query shows one of them.
    const [onMap, inList] = screen.getAllByRole('link', { name: /Artist number 1/ });
    expect(onMap).toHaveAccessibleName('Artist number 1, 1960');
    expect(onMap).toHaveAttribute('href', `/artiste/${neighbour(1, 1960).mbid}`);
    expect(inList).toHaveAttribute('href', `/artiste/${neighbour(1, 1960).mbid}`);
  });

  it('shows the ten closest, ten more on demand, thirty at most', async () => {
    const crowd = Array.from({ length: 35 }, (_, i) => neighbour(i, 1960 + i));
    showMap(artist(around(crowd)));
    const shown = () => screen.getAllByRole('link').length / 2;

    expect(shown()).toBe(10);
    await userEvent.click(screen.getByRole('button', { name: 'Voir 10 de plus' }));
    await userEvent.click(screen.getByRole('button', { name: 'Voir 10 de plus' }));
    expect(shown()).toBe(30);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('sets the artist among its neighbours in the list, with an end only when declared', () => {
    const { rerender } = showMap(
      artist(around([neighbour(1, 1960), neighbour(2, 1970)]), { y0: 1965 })
    );
    const lists = screen.getAllByRole('list');
    const rows = within(lists[lists.length - 1]!).getAllByRole('listitem');

    expect(rows.map((row) => row.textContent)).toEqual([
      '1960Artist number 1',
      '1965T. Rex – 1977',
      '1970Artist number 2',
    ]);

    rerender(
      <MusilogyMap
        artist={artist(around([neighbour(1, 1960)]), { yEndSource: 'last_album' })}
        thisYear={2026}
      />
    );
    expect(screen.getAllByText('T. Rex')).toHaveLength(2);
    expect(screen.queryByText(/1977/)).not.toBeInTheDocument();
  });

  it('names under the map a close neighbour whose start is unknown', () => {
    showMap(artist(around([neighbour(1, 1960)], [neighbour(2, null)])));

    expect(screen.getByText('Débuts inconnus')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Artist number 2' })).toHaveLength(2);
  });

  it('says beside a neighbour that it is also a declared influence', () => {
    showMap({
      ...artist(around([neighbour(1, 1960)])),
      influences: { cites: [{ ...neighbour(1, 1960), statement: 'Q1$a' }], citedBy: [] },
    });

    expect(screen.getAllByText(/son influence/)).toHaveLength(2);
  });
});
