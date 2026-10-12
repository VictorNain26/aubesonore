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

describe('a batch of slugs', () => {
  const plan = (pages: Array<{ mbid: string; name: string }>, taken: Set<string>) =>
    planSlugs(pages, new Set(candidatesOf(pages)), taken);

  it('asks about each name alone and its first suffixes, more for homonyms in the batch', () => {
    expect(candidatesOf([{ mbid: 'm1', name: 'Air' }])).toEqual([
      'air',
      'air-2',
      'air-3',
      'air-4',
      'air-5',
      'air-6',
    ]);
    expect(
      candidatesOf([
        { mbid: 'm1', name: 'Air' },
        { mbid: 'm2', name: 'AIR' },
      ])
    ).toHaveLength(7);
  });

  it('gives the plain name to the first of homonyms, the order given, and suffixes to the others', () => {
    const taken = new Set<string>();
    expect(
      plan(
        [
          { mbid: 'm1', name: 'Nirvana' },
          { mbid: 'm2', name: 'Nirvana' },
          { mbid: 'm3', name: 'Étienne Daho' },
        ],
        taken
      )
    ).toEqual({
      planned: [
        { mbid: 'm1', slug: 'nirvana' },
        { mbid: 'm2', slug: 'nirvana-2' },
        { mbid: 'm3', slug: 'etienne-daho' },
      ],
      deferred: [],
    });
    // What it gave is held from then on.
    expect(taken).toEqual(new Set(['nirvana', 'nirvana-2', 'etienne-daho']));
  });

  it('never gives a slug a page already holds', () => {
    expect(plan([{ mbid: 'm1', name: 'Radiohead' }], new Set(['radiohead'])).planned).toEqual([
      { mbid: 'm1', slug: 'radiohead-2' },
    ]);
  });

  it('defers a name whose free slug lies past what was asked, for claimSlug to read them all', () => {
    // john-smith and its first suffixes are all held: the next free one was not asked about.
    const taken = new Set([
      'john-smith',
      'john-smith-2',
      'john-smith-3',
      'john-smith-4',
      'john-smith-5',
      'john-smith-6',
    ]);
    const page = { mbid: 'm1', name: 'John Smith' };
    expect(plan([page], taken)).toEqual({ planned: [], deferred: [page] });
  });

  it('leaves out a name that makes no slug, or one the route would refuse', () => {
    expect(
      plan(
        [
          { mbid: 'm1', name: '!!!' },
          { mbid: 'm2', name: 'x'.repeat(201) },
          { mbid: 'm3', name: 'Кино' },
        ],
        new Set()
      )
    ).toEqual({ planned: [{ mbid: 'm3', slug: 'кино' }], deferred: [] });
  });
});
