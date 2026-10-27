import { describe, expect, it } from 'bun:test';
import {
  artistKey,
  normalizeArtistName,
  primaryArtistName,
  sameTitle,
  slugify,
} from './artistName';

describe('primaryArtistName', () => {
  it('strips explicit featuring markers', () => {
    expect(primaryArtistName('Justice feat. Uffie')).toBe('Justice');
    expect(primaryArtistName('Justice ft. Uffie')).toBe('Justice');
    expect(primaryArtistName('Justice featuring Uffie')).toBe('Justice');
    expect(primaryArtistName('Justice FEAT Uffie')).toBe('Justice');
  });

  it('keeps ampersands, plus signs and commas that belong to the name', () => {
    expect(primaryArtistName('Simon & Garfunkel')).toBe('Simon & Garfunkel');
    expect(primaryArtistName('Florence + The Machine')).toBe('Florence + The Machine');
    expect(primaryArtistName('Earth, Wind & Fire')).toBe('Earth, Wind & Fire');
  });

  it('leaves a name containing "feat" as a substring alone', () => {
    expect(primaryArtistName('Defeated Sanity')).toBe('Defeated Sanity');
  });

  it('trims surrounding whitespace', () => {
    expect(primaryArtistName('  Air  ')).toBe('Air');
  });
});

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    expect(slugify('Daft Punk')).toBe('daft-punk');
  });

  it('strips diacritics', () => {
    expect(slugify('Étienne Daho')).toBe('etienne-daho');
  });

  it('collapses punctuation and trims stray hyphens', () => {
    expect(slugify('Simon & Garfunkel!')).toBe('simon-garfunkel');
    expect(slugify('!!!')).toBe('');
  });

  it('keeps letters of every script', () => {
    expect(slugify('Кино')).toBe('кино');
  });
});

describe('normalizeArtistName', () => {
  it('folds case, accents and punctuation', () => {
    expect(normalizeArtistName('Beyoncé')).toBe(normalizeArtistName('BEYONCE'));
    expect(normalizeArtistName('Simon & Garfunkel')).toBe('simon garfunkel');
  });

  it('keys names written without Latin letters', () => {
    expect(normalizeArtistName('坂本龍一')).toBe('坂本龍一');
    expect(normalizeArtistName('Кино')).toBe('кино');
  });
});

describe('sameTitle', () => {
  it('matches a title and its versions, never another song', () => {
    expect(sameTitle('Un mec en or', 'Un Mec En Or')).toBe(true);
    expect(sameTitle('Come Together', 'Come Together (Remastered 2009)')).toBe(true);
    expect(sameTitle('Illusion Of Time', 'Dissolution')).toBe(false);
    expect(sameTitle('Un mec en or', 'Lirik Banzay')).toBe(false);
    // The Drums, measured 2026-10-04: an apostrophe typed on one side only.
    expect(sameTitle('Lets Go Surfing', 'Let’s Go Surfing')).toBe(true);
  });
});

describe('artistKey', () => {
  it('keys a raw name the way the resolver stores it', () => {
    expect(artistKey('Étienne Daho')).toBe('etienne daho');
    expect(artistKey('Cassius feat. Pharrell Williams')).toBe('cassius');
  });

  it('never splits a name on & or a comma', () => {
    expect(artistKey('Earth, Wind & Fire')).toBe('earth wind fire');
  });
});
