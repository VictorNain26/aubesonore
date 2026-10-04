// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import type { MusilogyArtist, MusilogyNeighbour } from '@aubesonore/shared-types/client';
import { layoutMap, MusilogyMap } from './MusilogyMap';

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
  y0: number | null = 1967
): MusilogyArtist {
  return {
    card: {
      mbid: 'c842d29f-a297-48cd-bb71-4f77fd672b16',
      name: 'T. Rex',
      disambiguation: null,
      y0,
      played: null,
      type: 'Group',
      country: 'GB',
      beginArea: null,
      y0Source: 'declared',
      yEnd: 1977,
      yEndSource: 'declared',
      ended: true,
      genres: [],
      listeners: null,
    },
    neighbours,
    influences: null,
    links: [],
  };
}

const around = (before: MusilogyNeighbour[], during: MusilogyNeighbour[] = []) => ({
  before,
  during,
  after: [],
  undated: [],
});

describe('layoutMap', () => {
  it('draws nothing without a start year or without neighbours', () => {
    expect(layoutMap(artist(around([neighbour(1, 1960)]), null), 2026)).toBeNull();
    expect(layoutMap(artist(null), 2026)).toBeNull();
    expect(layoutMap(artist(around([neighbour(1, null)])), 2026)).toBeNull();
  });

  it('spans every year shown, by whole decades', () => {
    const layout = layoutMap(artist(around([neighbour(1, 1957)], [neighbour(2, 1985)])), 2026);

    expect(layout?.ticks.map((t) => t.year)).toEqual([1950, 1960, 1970, 1980, 1990]);
    expect(layout?.center.x1).toBeGreaterThan(layout?.center.x0 ?? Infinity);
  });

  it('puts the closest neighbours on the rows nearest the axis', () => {
    const layout = layoutMap(
      artist(around([neighbour(1, 1964, 900), neighbour(2, 1964, 1000), neighbour(3, 1964, 800)])),
      2026
    );
    const distance = (n: number) =>
      Math.abs(
        (layout?.placed.find((p) => p.neighbour.name === `Artist number ${n}`)?.y ?? 0) -
          (layout?.axisY ?? 0)
      );

    expect(distance(2)).toBeLessThanOrEqual(distance(1));
    expect(distance(1)).toBeLessThanOrEqual(distance(3));
  });

  it('never lays two labels over each other on a row', () => {
    const crowd = Array.from({ length: 30 }, (_, i) => neighbour(i, 1965 + (i % 3)));
    const layout = layoutMap(artist(around(crowd)), 2026);
    const rows = new Map<number, Array<[number, number]>>();
    for (const p of layout?.placed ?? []) {
      const width = p.neighbour.name.length * 7.2 + 16;
      const span: [number, number] = p.anchor === 'start' ? [p.x, p.x + width] : [p.x - width, p.x];
      const row = rows.get(p.y) ?? [];
      expect(row.every(([a, b]) => span[1] < a || span[0] > b)).toBe(true);
      rows.set(p.y, [...row, span]);
    }
    expect(layout?.placed.length).toBeLessThan(crowd.length);
  });
});

describe('MusilogyMap', () => {
  it('links each neighbour to its own map, out of the screen readers’ way', () => {
    render(<MusilogyMap artist={artist(around([neighbour(1, 1960)]))} thisYear={2026} />, {
      wrapper: MemoryRouter,
    });

    // The lists below are what screen readers read: the drawing is hidden from them.
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { hidden: true })).toHaveAttribute(
      'href',
      `/musilogy/${neighbour(1, 1960).mbid}/artist-number-1`
    );
  });
});
