// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { MusilogyArtist, MusilogyNeighbour } from '@aubesonore/shared-types/client';
import { axisOf, barLabelsOf, sharedTerm, spanOf, timelineNote, yearsOf } from './MusilogyTimeline';

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
    ).toBe('krautrock');
    expect(sharedTerm(['Krautrock', 'Ambient'].map((t) => neighbour(t)))).toBe('krautrock');
    expect(sharedTerm(['Krautrock', 'Ambient', 'Post Rock'].map((t) => neighbour(t)))).toBeNull();
    // A Discogs style and a MusicBrainz genre of one name are one.
    expect(
      sharedTerm(['Krautrock', 'krautrock', 'Ambient', 'Post Rock'].map((t) => neighbour(t)))
    ).toBe('krautrock');
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

describe('barLabelsOf', () => {
  const axis = { from: 1960, to: 2026, ticks: [1960, 1980, 2000] };

  it('writes the start at the left end of the bar and the declared end at its right end', () => {
    expect(barLabelsOf(neighbour('krautrock', { y0: 1968, yEnd: 1991 }), axis)).toEqual([
      { text: '1968', at: (8 / 66) * 100, align: 'start' },
      { text: '1991', at: (31 / 66) * 100, align: 'end' },
    ]);
  });

  it('writes one label when the two would meet, the start alone while it runs to today', () => {
    expect(barLabelsOf(neighbour('krautrock'), axis)).toEqual([
      { text: '1971–1975', at: (11 / 66) * 100, align: 'start' },
    ]);
    expect(barLabelsOf(neighbour('ambient', { y0: 1990, ended: false }), axis)).toEqual([
      { text: '1990', at: (30 / 66) * 100, align: 'start' },
    ]);
    expect(barLabelsOf(neighbour('ambient', { y0: null }), axis)).toEqual([]);
  });

  it('ends a label at the track end rather than run past it', () => {
    expect(barLabelsOf(neighbour('ambient', { y0: 2021, ended: false }), axis)).toEqual([
      { text: '2021', at: 100, align: 'end' },
    ]);
    expect(barLabelsOf(neighbour('ambient', { y0: 2015, yEnd: 2020 }), axis)).toEqual([
      { text: '2015–2020', at: (60 / 66) * 100, align: 'end' },
    ]);
  });

  it('says an end is unknown rather than draw a one-year career', () => {
    expect(barLabelsOf(neighbour('krautrock', { yEnd: null }), axis)).toEqual([
      { text: '1971, fin inconnue', at: (11 / 66) * 100, align: 'start' },
    ]);
  });
});

describe('axisOf', () => {
  it('runs from a decade to today, labels never crowding it', () => {
    expect(
      axisOf(
        [
          { from: 1971, to: 1975 },
          { from: 1990, to: 2026 },
        ],
        2026
      )
      // 2010 sat on « aujourd'hui » on Tim Hecker's page: no label past 62 % of the axis.
    ).toEqual({ from: 1970, to: 2026, ticks: [1970, 1980, 1990, 2000] });
    // Twenty years apart past sixty; 2000, at 66 % of the axis, would meet « aujourd'hui ».
    expect(axisOf([{ from: 1955, to: 2026 }], 2026)?.ticks).toEqual([1960, 1980]);
    expect(axisOf([], 2026)).toBeNull();
  });
});

describe('yearsOf', () => {
  it('says the years the bar draws', () => {
    expect(yearsOf(neighbour('Krautrock'))).toBe('de 1971 à 1975');
    expect(yearsOf(neighbour('Krautrock', { ended: false, yEnd: null, y0: 1969 }))).toBe(
      'depuis 1969'
    );
    // Ended without a declared end: never a year alone, which reads as a one-year career.
    expect(yearsOf(neighbour('Krautrock', { yEnd: null }))).toBe('1971, fin inconnue');
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

  it('says the sound they share, once', () => {
    expect(timelineNote(can())).toBe('Le même son, surtout krautrock.');
    expect(timelineNote(can({}, ['Krautrock', 'Ambient', 'Post Rock']))).toBe('Le même son.');
    // Without a start, no band to speak of.
    expect(timelineNote(can({ y0: null }))).toBe('Le même son, surtout krautrock.');
  });
});
