import { describe, expect, it } from 'bun:test';
import type { ArtistProfile, MusilogyArtist } from '@aubesonore/shared-types/client';
import { artistDescription, artistTitle } from './artistMeta';

const KRAFTWERK: ArtistProfile = {
  id: 'a1',
  name: 'Kraftwerk',
  slug: 'kraftwerk',
  mbid: '5700dcd4-c139-4f31-aa3e-6382b9af9032',
  played: true,
  images: [],
  facts: {
    kind: 'group',
    place: 'Düsseldorf',
    country: 'DE',
    formed: 1970,
    ended: null,
    active: true,
  },
  summary: {
    text: 'Groupe allemand de musique électronique.',
    lang: 'fr',
    url: 'https://fr.wikipedia.org/wiki/Kraftwerk',
  },
  links: [],
};

const neighbour = (name: string, rank: number) => ({
  mbid: `m-${rank}`,
  name,
  slug: name.toLowerCase(),
  disambiguation: null,
  type: 'Group',
  y0: 1970,
  yEnd: null,
  ended: false,
  rank,
  term: 'krautrock',
});

const MUSILOGY = {
  card: {},
  neighbours: ['Neu!', 'Can', 'Depeche Mode', 'New Order', 'Orbital'].map((n, i) =>
    neighbour(n, i + 1)
  ),
  releases: [{ mbid: 'r1', title: 'Autobahn', primaryType: 'Album', year: 1974 }],
  bands: { members: [], groups: [], jointProjects: [] },
  memberProjects: null,
  otherNames: null,
} as unknown as MusilogyArtist;

describe('artistTitle', () => {
  it('tells homonyms apart and names the similar artists when the page has them', () => {
    expect(artistTitle(KRAFTWERK, MUSILOGY, 'fr')).toBe(
      'Kraftwerk (groupe, Düsseldorf) : artistes similaires · AubeSonore'
    );
    expect(artistTitle(KRAFTWERK, MUSILOGY, 'en')).toBe(
      'Kraftwerk (band, Düsseldorf): similar artists · AubeSonore'
    );
  });

  it('promises no similar artists when the page has none', () => {
    expect(artistTitle(KRAFTWERK, null, 'fr')).toBe('Kraftwerk (groupe, Düsseldorf) · AubeSonore');
  });

  it('falls back on the country, then on the name alone', () => {
    const noPlace = { ...KRAFTWERK, facts: { ...KRAFTWERK.facts!, place: null } };
    expect(artistTitle(noPlace, null, 'fr')).toBe('Kraftwerk (groupe, Allemagne) · AubeSonore');
    expect(artistTitle({ ...KRAFTWERK, facts: null }, null, 'en')).toBe('Kraftwerk · AubeSonore');
  });
});

describe('artistDescription', () => {
  it('says the facts, four similar artists by name and what else the page holds', () => {
    expect(artistDescription(KRAFTWERK, MUSILOGY, 'fr')).toBe(
      'Groupe · Düsseldorf, Allemagne · depuis 1970. Artistes similaires : Neu!, Can, Depeche Mode, New Order. Ses albums et EP, ses groupes et projets.'
    );
    expect(artistDescription(KRAFTWERK, MUSILOGY, 'en')).toBe(
      'Band · Düsseldorf, Germany · since 1970. Similar artists: Neu!, Can, Depeche Mode, New Order. Their albums and EPs, their bands and projects.'
    );
  });

  it('uses the Wikipedia opening when Musilogy has nothing to add', () => {
    expect(artistDescription(KRAFTWERK, null, 'fr')).toBe(
      'Groupe allemand de musique électronique.'
    );
  });

  it('says the facts, or names the site, when there is nothing else', () => {
    expect(artistDescription({ ...KRAFTWERK, summary: null }, null, 'fr')).toBe(
      'Groupe · Düsseldorf, Allemagne · depuis 1970.'
    );
    expect(artistDescription({ ...KRAFTWERK, summary: null, facts: null }, null, 'en')).toBe(
      'Kraftwerk on AubeSonore, the indie, electronic, hip-hop discovery radio.'
    );
  });

  it('stays within 200 characters', () => {
    const long = {
      ...MUSILOGY,
      neighbours: MUSILOGY.neighbours!.map((n) => ({ ...n, name: n.name.repeat(12) })),
    };
    expect(artistDescription(KRAFTWERK, long, 'fr').length).toBeLessThanOrEqual(200);
  });
});
