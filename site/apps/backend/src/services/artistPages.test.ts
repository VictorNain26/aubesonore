import { describe, it, expect } from 'bun:test';
import { matchPages } from './artistPages';
import { artistKey } from './artistResolver';

const CASSIUS = { normalizedName: 'cassius', id: 'a-1', slug: 'cassius' };
const DAHO = { normalizedName: 'etienne daho', id: 'a-2', slug: 'etienne-daho' };

describe('artistKey', () => {
  it('keys a raw name the way the resolver stores it', () => {
    expect(artistKey('Étienne Daho')).toBe('etienne daho');
    expect(artistKey('Cassius feat. Pharrell Williams')).toBe('cassius');
  });

  it('never splits a name on & or a comma', () => {
    expect(artistKey('Earth, Wind & Fire')).toBe('earth wind fire');
  });
});

describe('matchPages', () => {
  it('pairs each raw name with the page stored under its key', () => {
    expect(
      matchPages(['Étienne Daho', 'Cassius feat. Pharrell Williams'], [CASSIUS, DAHO])
    ).toEqual({
      'Étienne Daho': { id: 'a-2', slug: 'etienne-daho' },
      'Cassius feat. Pharrell Williams': { id: 'a-1', slug: 'cassius' },
    });
  });

  it('leaves out a name without a page', () => {
    expect(matchPages(['Cassius', 'Nobody'], [CASSIUS])).toEqual({
      Cassius: { id: 'a-1', slug: 'cassius' },
    });
  });

  it('keeps a name such as __proto__ a plain key', () => {
    const pages = matchPages(
      ['__proto__'],
      [{ normalizedName: 'proto', id: 'a-3', slug: 'proto' }]
    );

    expect(Object.getPrototypeOf(pages)).toBe(Object.prototype);
    expect(Object.hasOwn(pages, '__proto__')).toBe(true);
  });
});
