import { describe, it, expect } from 'bun:test';
import { normalize, similarity, artistMatch, songMatch } from './matchScore';

describe('normalize', () => {
  it('lowercases, strips accents, feat and punctuation', () => {
    expect(normalize("L'Avenir")).toBe('l avenir');
    expect(normalize('Blue Bird (Feat Keren Ilan)')).toBe('blue bird');
    expect(normalize('Kiwi jr.')).toBe('kiwi jr');
  });
});

describe('similarity', () => {
  it('is 1 for the same string, 0 for nothing shared, in between for a near one', () => {
    expect(similarity('goldstar', 'goldstar')).toBe(1);
    expect(similarity('aaaa', 'zzzz')).toBe(0);
    const near = similarity('goldstar', 'goldstars');
    expect(near).toBeGreaterThan(0.8);
    expect(near).toBeLessThan(1);
  });
});

describe('artistMatch', () => {
  it.each([
    ['the same name', 'The Sophs', 'The Sophs'],
    ['a name in another case', 'canaries', 'Canaries'],
    ['a name with a stray dot', 'Kiwi jr', 'Kiwi jr.'],
    ['the same Cyrillic name in another case', 'Кино', 'кино'],
    ['the same name in kanji', '坂本龍一', '坂本龍一'],
  ])('accepts %s', (_, played, found) => {
    expect(artistMatch(played, found)).toBe(true);
  });

  it.each([
    ['another artist', 'gemstonemario', 'Écho Mémoire'],
    ['another Cyrillic name', 'Кино', 'Ария'],
    ['another name in kanji', '坂本龍一', '久石譲'],
    ['names of punctuation alone, which say nothing', '!!!', '???'],
  ])('refuses %s', (_, played, found) => {
    expect(artistMatch(played, found)).toBe(false);
  });
});

describe('songMatch', () => {
  it('accepts the exact song by the right artist', () => {
    expect(
      songMatch(
        { title: 'GOLDSTAR', artist: 'The Sophs' },
        { title: 'GOLDSTAR', artist: 'The Sophs' }
      )
    ).toBe(true);
  });
  it('rejects a different song by the right artist (cover ok, links not)', () => {
    expect(
      songMatch({ title: 'GOLDSTAR', artist: 'The Sophs' }, { title: 'HOUSE', artist: 'The Sophs' })
    ).toBe(false);
  });
});
