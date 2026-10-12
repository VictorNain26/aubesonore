import { describe, expect, it } from 'bun:test';
import { freeSlug, planSlugs } from './artistSlugs';

describe('freeSlug', () => {
  it('gives the name alone while no page holds it, else the next free suffix', () => {
    expect(freeSlug('cassius', new Set())).toBe('cassius');
    expect(freeSlug('cassius', new Set(['cassius']))).toBe('cassius-2');
    expect(freeSlug('cassius', new Set(['cassius', 'cassius-2', 'cassius-4']))).toBe('cassius-3');
  });

  it('counts past a hundred homonyms, which the whole of Musilogy holds', () => {
    const taken = new Set([
      'john-smith',
      ...Array.from({ length: 150 }, (_, i) => `john-smith-${i + 2}`),
    ]);
    expect(freeSlug('john-smith', taken)).toBe('john-smith-152');
  });
});

describe('planSlugs', () => {
  it('gives the plain name to the first of homonyms, the order given, and suffixes to the others', () => {
    const taken = new Set<string>();
    expect(
      planSlugs(
        [
          { mbid: 'm1', name: 'Nirvana' },
          { mbid: 'm2', name: 'Nirvana' },
          { mbid: 'm3', name: 'Étienne Daho' },
        ],
        taken
      )
    ).toEqual([
      { mbid: 'm1', slug: 'nirvana' },
      { mbid: 'm2', slug: 'nirvana-2' },
      { mbid: 'm3', slug: 'etienne-daho' },
    ]);
    // What it gave is held from then on.
    expect(taken).toEqual(new Set(['nirvana', 'nirvana-2', 'etienne-daho']));
  });

  it('never gives a slug a page already holds', () => {
    const taken = new Set(['radiohead']);
    expect(planSlugs([{ mbid: 'm1', name: 'Radiohead' }], taken)).toEqual([
      { mbid: 'm1', slug: 'radiohead-2' },
    ]);
  });

  it('leaves out a name that makes no slug, or one the route would refuse', () => {
    expect(
      planSlugs(
        [
          { mbid: 'm1', name: '!!!' },
          { mbid: 'm2', name: 'x'.repeat(201) },
          { mbid: 'm3', name: 'Кино' },
        ],
        new Set()
      )
    ).toEqual([{ mbid: 'm3', slug: 'кино' }]);
  });
});
