import { describe, expect, it } from 'bun:test';
import { candidatesOf, freeSlug, planSlugs } from './artistSlugs';

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

describe('freeSlug from a rank', () => {
  it('proposes the plain name to the first of homonyms, a suffix by rank to the others', () => {
    expect(freeSlug('nirvana', new Set(), 1)).toBe('nirvana');
    expect(freeSlug('nirvana', new Set(), 2)).toBe('nirvana-2');
    // The third, published before the first: the plain name stays the first's.
    expect(freeSlug('nirvana', new Set(), 3)).toBe('nirvana-3');
    expect(freeSlug('nirvana', new Set(['nirvana-3']), 3)).toBe('nirvana-4');
  });
});

describe('slugs published together', () => {
  const plan = (pages: Array<{ mbid: string; name: string; rank: number }>, taken: Set<string>) =>
    planSlugs(pages, new Set(candidatesOf(pages)), taken);

  it("asks about each page's proposal and the few after it", () => {
    expect(candidatesOf([{ mbid: 'm1', name: 'Air', rank: 1 }])).toEqual([
      'air',
      'air-2',
      'air-3',
      'air-4',
      'air-5',
    ]);
    expect(candidatesOf([{ mbid: 'm1', name: 'Air', rank: 7 }])).toEqual([
      'air-7',
      'air-8',
      'air-9',
      'air-10',
    ]);
  });

  it('names homonyms by their rank, whichever is published first', () => {
    const taken = new Set<string>();
    expect(
      plan(
        [
          { mbid: 'm2', name: 'Nirvana', rank: 2 },
          { mbid: 'm1', name: 'Nirvana', rank: 1 },
          { mbid: 'm3', name: 'Étienne Daho', rank: 1 },
        ],
        taken
      )
    ).toEqual({
      planned: [
        { mbid: 'm2', slug: 'nirvana-2' },
        { mbid: 'm1', slug: 'nirvana' },
        { mbid: 'm3', slug: 'etienne-daho' },
      ],
      deferred: [],
    });
    // What it gave is held from then on.
    expect(taken).toEqual(new Set(['nirvana-2', 'nirvana', 'etienne-daho']));
  });

  it('never gives a slug a page already holds', () => {
    expect(
      plan([{ mbid: 'm1', name: 'Radiohead', rank: 1 }], new Set(['radiohead'])).planned
    ).toEqual([{ mbid: 'm1', slug: 'radiohead-2' }]);
  });

  it('defers a page whose free slug lies past what was asked, for claimSlug to read them all', () => {
    const page = { mbid: 'm1', name: 'John Smith', rank: 1 };
    const taken = new Set(candidatesOf([page]));
    expect(plan([page], taken)).toEqual({ planned: [], deferred: [page] });
  });

  it('leaves out a name that makes no slug, or one the route would refuse', () => {
    expect(
      plan(
        [
          { mbid: 'm1', name: '!!!', rank: 1 },
          { mbid: 'm2', name: 'x'.repeat(201), rank: 1 },
          { mbid: 'm3', name: 'Кино', rank: 1 },
        ],
        new Set()
      )
    ).toEqual({ planned: [{ mbid: 'm3', slug: 'кино' }], deferred: [] });
  });
});
