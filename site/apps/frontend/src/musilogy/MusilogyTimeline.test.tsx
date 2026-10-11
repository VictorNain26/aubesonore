// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { MusilogyArtist, MusilogyNeighbour } from '@aubesonore/shared-types/client';
import { axisOf, sharedTerm, spanOf, timelineNote, yearsOf } from './MusilogyTimeline';

function neighbour(term: string, overrides: Partial<MusilogyNeighbour> = {}): MusilogyNeighbour {
  return {
    mbid: '00000000-0000-4000-8000-000000000001',
    name: 'Neu!',
    disambiguation: null,
    y0: 1971,
    played: null,
    yEnd: 1975,
    ended: true,
    rank: 1,
    term,
    ...overrides,
  };
}

describe('sharedTerm', () => {
  it('names the style at least half of them share, said once above them', () => {
    expect(
      sharedTerm(['Krautrock', 'Krautrock', 'Ambient', 'Krautrock'].map((t) => neighbour(t)))
    ).toBe('Krautrock');
    expect(sharedTerm(['Krautrock', 'Ambient'].map((t) => neighbour(t)))).toBe('Krautrock');
    expect(sharedTerm(['Krautrock', 'Ambient', 'Post Rock'].map((t) => neighbour(t)))).toBeNull();
  });
});

describe('spanOf', () => {
  it('runs to this year while the artist has not ended, to its declared end once it has', () => {
    expect(spanOf(1969, null, false, 2026)).toEqual({ from: 1969, to: 2026 });
    expect(spanOf(1971, 1975, true, 2026)).toEqual({ from: 1971, to: 1975 });
    // Ended without a date: its start alone, never a guessed end.
    expect(spanOf(1971, null, true, 2026)).toEqual({ from: 1971, to: 1971 });
    expect(spanOf(null, null, false, 2026)).toBeNull();
  });
});

describe('axisOf', () => {
  it('covers every span in whole decades, a label every ten years or twenty past sixty', () => {
    expect(
      axisOf([
        { from: 1971, to: 1975 },
        { from: 1990, to: 2026 },
      ])
    ).toEqual({
      from: 1970,
      to: 2030,
      ticks: [1970, 1980, 1990, 2000, 2010, 2020, 2030],
    });
    expect(axisOf([{ from: 1955, to: 2026 }])?.ticks).toEqual([1960, 1980, 2000, 2020]);
    expect(axisOf([])).toBeNull();
  });
});

describe('yearsOf', () => {
  it('says the years the bar draws', () => {
    expect(yearsOf(neighbour('Krautrock'))).toBe('de 1971 à 1975');
    expect(yearsOf(neighbour('Krautrock', { ended: false, yEnd: null, y0: 1969 }))).toBe(
      'depuis 1969'
    );
    expect(yearsOf(neighbour('Krautrock', { yEnd: null }))).toBe('1971');
    expect(yearsOf(neighbour('Krautrock', { y0: null }))).toBe('début inconnu');
  });
});

describe('timelineNote', () => {
  const can = (overrides: Partial<MusilogyArtist['card']> = {}, terms = ['Krautrock']) =>
    ({
      card: {
        mbid: '13501c7d-d181-45ba-af52-5f101d8516a0',
        name: 'Can',
        disambiguation: null,
        y0: 1968,
        played: null,
        kind: 'group',
        y0Source: 'declared',
        yEnd: 1991,
        yEndSource: 'declared',
        ended: true,
        genres: [],
        ...overrides,
      },
      neighbours: terms.map((t) => neighbour(t)),
      releases: null,
      bands: null,
      memberProjects: null,
      otherNames: null,
    }) as MusilogyArtist;

  it('says the shared sound, then what the light band marks', () => {
    expect(timelineNote(can(), 2026)).toBe(
      'Le même son, surtout krautrock. La bande claire marque les années de Can.'
    );
    expect(timelineNote(can({}, ['Krautrock', 'Ambient', 'Post Rock']), 2026)).toBe(
      'Le même son. La bande claire marque les années de Can.'
    );
    // Without a start, no band to speak of.
    expect(timelineNote(can({ y0: null }), 2026)).toBe('Le même son, surtout krautrock.');
  });
});
