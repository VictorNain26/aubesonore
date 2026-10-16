import { describe, expect, it } from 'bun:test';
import {
  deezerIdOf,
  kindOf,
  firstCoverOf,
  toFacts,
  toLinks,
  wikidataIdOf,
  type CardRow,
  type ReleaseRow,
} from './musilogyMapping';

const card = (fields: Partial<CardRow>): CardRow => ({
  mbid: 'm',
  name: 'N',
  disambiguation: null,
  type: 'Group',
  country: null,
  begin_area: null,
  y0: null,
  y0_source: null,
  y_end: null,
  y_end_source: null,
  ended: null,
  genres: null,
  ...fields,
});

const release = (mbid: string, primary_type: string, y: number | null): ReleaseRow => ({
  mbid,
  title: mbid,
  primary_type,
  soundtrack: false,
  remix: false,
  y,
});

describe('toFacts', () => {
  it("gives a group's declared dates, place and activity", () => {
    expect(
      toFacts(
        card({
          country: 'GB',
          begin_area: 'Manchester',
          y0: 1976,
          y0_source: 'declared',
          y_end: 1980,
          y_end_source: 'declared',
          ended: true,
        })
      )
    ).toEqual({
      kind: 'group',
      place: 'Manchester',
      country: 'GB',
      formed: 1976,
      ended: 1980,
      active: false,
    });
  });

  it("never gives a person's dates or area as a career", () => {
    const facts = toFacts(
      card({ type: 'Person', begin_area: 'London', y0: 1947, y0_source: 'declared' })
    );
    expect([facts.place, facts.formed, facts.active]).toEqual([null, null, false]);
  });

  it('leaves out an inferred start, an area that repeats the country, a dissolved country', () => {
    const facts = toFacts(
      card({ country: 'GB', begin_area: 'United Kingdom', y0: 1990, y0_source: 'first_release' })
    );
    expect([facts.place, facts.formed]).toEqual([null, null]);
    expect(toFacts(card({ country: 'SU' })).country).toBeNull();
    expect(toFacts(card({ country: 'XW' })).country).toBeNull();
  });
});

describe('kindOf', () => {
  it('words the four types the site names, and nothing for any other', () => {
    expect(['Person', 'Group', 'Orchestra', 'Choir'].map(kindOf)).toEqual([
      'person',
      'group',
      'orchestra',
      'choir',
    ]);
    expect(['Character', 'Other', null].map(kindOf)).toEqual([null, null, null]);
  });
});

describe('toLinks', () => {
  it('keeps one https link per platform, in listening order, the official site last', () => {
    expect(
      toLinks([
        { type: 'official homepage', url: 'https://band.example' },
        { type: 'streaming', url: 'https://open.spotify.com/artist/1' },
        { type: 'streaming', url: 'https://open.spotify.com/artist/2' },
        { type: 'streaming', url: 'http://soundcloud.com/band' },
        { type: 'bandcamp', url: 'https://band.bandcamp.com' },
      ])
    ).toEqual([
      { platform: 'spotify', url: 'https://open.spotify.com/artist/1' },
      { platform: 'bandcamp', url: 'https://band.bandcamp.com' },
      { platform: 'official', url: 'https://band.example' },
    ]);
  });

  it('never takes a host that only looks like a platform for it', () => {
    expect(
      toLinks([
        { type: 'streaming', url: 'https://evil-bandcamp.com/band' },
        { type: 'streaming', url: 'https://bandcamp.com.evil/band' },
      ])
    ).toEqual([]);
  });

  it('lists an official site that is the Bandcamp page once, as Bandcamp', () => {
    const url = 'https://band.bandcamp.com';
    expect(
      toLinks([
        { type: 'official homepage', url },
        { type: 'bandcamp', url },
      ])
    ).toEqual([{ platform: 'bandcamp', url }]);
  });
});

describe('the ids the dump declares', () => {
  it('takes a Wikidata item or a Deezer artist only when there is exactly one', () => {
    const wikidata = (id: string) => ({
      type: 'wikidata',
      url: `https://www.wikidata.org/wiki/${id}`,
    });
    const deezer = (id: string) => ({
      type: 'streaming',
      url: `https://www.deezer.com/artist/${id}`,
    });
    expect(wikidataIdOf([wikidata('Q1'), wikidata('Q1')])).toBe('Q1');
    expect(wikidataIdOf([wikidata('Q1'), wikidata('Q2')])).toBeNull();
    expect(deezerIdOf([deezer('7')])).toBe('7');
    expect(deezerIdOf([deezer('7'), deezer('8')])).toBeNull();
  });
});

describe('firstCoverOf', () => {
  it('takes the earliest album, else the earliest record, whatever the order given', () => {
    expect(
      firstCoverOf([
        release('ep', 'EP', 1970),
        release('b', 'Album', 1975),
        release('a', 'Album', 1972),
      ])?.title
    ).toBe('a');
    expect(firstCoverOf([release('ep2', 'EP', 1980), release('ep1', 'EP', 1978)])?.title).toBe(
      'ep1'
    );
    expect(firstCoverOf([])).toBeNull();
  });
});
