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
  it('returns 1 for identical strings', () => {
    expect(similarity('goldstar', 'goldstar')).toBe(1);
  });
  it('returns 0 for completely different strings of same length', () => {
    expect(similarity('aaaa', 'zzzz')).toBe(0);
  });
  it('returns a value between 0 and 1 for partial matches', () => {
    const score = similarity('goldstar', 'goldstars');
    expect(score).toBeGreaterThan(0.8);
    expect(score).toBeLessThan(1);
  });
});

describe('artistMatch', () => {
  it('accepts the same artist regardless of the song', () => {
    expect(artistMatch('The Sophs', 'The Sophs')).toBe(true);
  });
  it('rejects a different artist', () => {
    expect(artistMatch('gemstonemario', 'Écho Mémoire')).toBe(false);
  });
  it('tells apart two names in another script', () => {
    expect(artistMatch('Кино', 'Ария')).toBe(false);
    expect(artistMatch('坂本龍一', '久石譲')).toBe(false);
  });

  it('accepts the same name in another script', () => {
    expect(artistMatch('Кино', 'кино')).toBe(true);
    expect(artistMatch('坂本龍一', '坂本龍一')).toBe(true);
  });

  it('never matches on nothing: a name made only of punctuation', () => {
    expect(artistMatch('!!!', '???')).toBe(false);
  });

  it('tolerates casing/punctuation drift', () => {
    expect(artistMatch('canaries', 'Canaries')).toBe(true);
    expect(artistMatch('Kiwi jr', 'Kiwi jr.')).toBe(true);
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
