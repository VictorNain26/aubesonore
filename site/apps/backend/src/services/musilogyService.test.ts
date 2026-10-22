import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { DrizzleQueryError, type SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';

import * as realSchema from '../db/schema';

// The SQL is tested in musilogy against Postgres; here the database answers
// by the musilogy function a query calls, read from the SQL drizzle builds.
const dialect = new PgDialect();
let answers: Record<string, Array<Record<string, unknown>>> = {};
let loaded = true;
// Functions a load older than them lacks.
let missing = new Set<string>();
let asked: string[] = [];

function answer(query: SQL) {
  const built = dialect.sqlToQuery(query);
  const fn = /musilogy\.(\w+)\(/.exec(built.sql)?.[1] ?? '';
  if (!loaded || missing.has(fn)) {
    const [message, code] = loaded
      ? [`function musilogy.${fn} does not exist`, '42883']
      : ['schema "musilogy" does not exist', '3F000'];
    return Promise.reject(
      new DrizzleQueryError(built.sql, built.params, Object.assign(new Error(message), { code }))
    );
  }
  asked.push(fn);
  return Promise.resolve({ rows: answers[fn] ?? [] });
}

void mock.module('../db/index', () => ({
  schema: realSchema,
  db: {
    execute: answer,
    select: () => ({
      // The played artists with their page slugs (the joins), and the MBIDs' slugs (where).
      from: () => ({
        leftJoin: () => ({ leftJoin: () => ({ where: () => Promise.resolve([]) }) }),
        where: () => Promise.resolve([]),
      }),
    }),
  },
}));

const {
  coreCache,
  getArtistIdentity,
  getMusilogyArtist,
  identityCache,
  musilogyCache,
  MusilogyUnavailable,
} = await import('./musilogyService');

const DAFT_PUNK = '056e4f3e-d505-4dad-8ec1-d04f521cbb56';

const card = (values: Record<string, unknown> = {}) => ({
  mbid: DAFT_PUNK,
  name: 'Daft Punk',
  disambiguation: null,
  type: 'Group',
  country: 'FR',
  begin_area: 'Paris',
  y_birth: null,
  y0: 1993,
  y0_source: 'declared',
  y_end: 2021,
  y_end_source: 'declared',
  ended: true,
  styles: [],
  listen_count: null,
  user_count: null,
  ...values,
});

// What artist_urls gives Daft Punk on the dump of 2026-09-09, trimmed.
const urls = [
  { type: 'free streaming', url: 'https://open.spotify.com/artist/4tZwfgrHOc3mvqYlEYSvVi' },
  { type: 'free streaming', url: 'https://www.deezer.com/artist/27' },
  { type: 'official homepage', url: 'http://mouskni.com/artists/daft-punk/' },
  { type: 'official homepage', url: 'https://daftpunk.com/' },
  { type: 'soundcloud', url: 'https://soundcloud.com/daftpunkofficialmusic' },
  { type: 'streaming', url: 'https://music.apple.com/fr/artist/5468295' },
  { type: 'wikidata', url: 'https://www.wikidata.org/wiki/Q185828' },
];

// Homework (1997) before its EP The New Wave (1994): the album comes first.
const HOMEWORK = 'a7da8a4c-6e8b-3d3e-b6f1-7c0fd3ed3d5b';
// As artist_releases gives them: the latest first.
const releases = [
  {
    mbid: 'f2a1c0b7-6b3e-4f3a-9d8e-5c4b3a291807',
    title: 'Discovery',
    primary_type: 'Album',
    y: 2001,
  },
  { mbid: HOMEWORK, title: 'Homework', primary_type: 'Album', y: 1997 },
  {
    mbid: 'b1c9a6f0-3c8f-3e5a-9a8e-2f1b4c0d9e77',
    title: 'The New Wave',
    primary_type: 'EP',
    y: 1994,
  },
];

beforeEach(() => {
  answers = { artist_card: [card()], artist_urls: urls, artist_releases: releases };
  loaded = true;
  missing = new Set();
  asked = [];
  identityCache.dispose();
  coreCache.dispose();
  musilogyCache.dispose();
});

describe('getArtistIdentity', () => {
  it("reads a group's career, one link per platform, https only, site last", async () => {
    expect(await getArtistIdentity(DAFT_PUNK)).toEqual({
      name: 'Daft Punk',
      deezerId: '27',
      facts: {
        kind: 'group',
        place: 'Paris',
        country: 'FR',
        formed: 1993,
        ended: 2021,
        active: false,
      },
      links: [
        { platform: 'spotify', url: 'https://open.spotify.com/artist/4tZwfgrHOc3mvqYlEYSvVi' },
        { platform: 'appleMusic', url: 'https://music.apple.com/fr/artist/5468295' },
        { platform: 'soundcloud', url: 'https://soundcloud.com/daftpunkofficialmusic' },
        { platform: 'official', url: 'https://daftpunk.com/' },
      ],
      wikidataId: 'Q185828',
      firstCover: {
        url: `https://coverartarchive.org/release-group/${HOMEWORK}/front-500`,
        title: 'Homework',
        year: 1997,
      },
      records: releases.length,
    });
  });

  it("takes the first EP's cover when there is no album, and none without a record", async () => {
    answers.artist_releases = [releases[2]!];
    expect((await getArtistIdentity(DAFT_PUNK))?.firstCover).toEqual({
      url: `https://coverartarchive.org/release-group/${releases[2]!.mbid}/front-500`,
      title: 'The New Wave',
      year: 1994,
    });

    identityCache.dispose();
    coreCache.dispose();
    answers.artist_releases = [];
    expect((await getArtistIdentity(DAFT_PUNK))?.firstCover).toBeNull();
  });

  it('prefers an undated album to a dated EP', async () => {
    const undated = { ...releases[1]!, y: null };
    answers.artist_releases = [releases[2]!, undated];
    expect((await getArtistIdentity(DAFT_PUNK))?.firstCover).toEqual({
      url: `https://coverartarchive.org/release-group/${HOMEWORK}/front-500`,
      title: 'Homework',
      year: null,
    });
  });

  it('never reads a birth as a career for a person', async () => {
    answers.artist_card = [
      card({ type: 'Person', begin_area: 'Reykjavík', country: 'IS', y0: 1977, ended: false }),
    ];

    expect((await getArtistIdentity(DAFT_PUNK))?.facts).toEqual({
      kind: 'person',
      place: null,
      country: 'IS',
      formed: null,
      ended: null,
      active: false,
    });
  });

  it('says no kind, place nor year for an artist without a type', async () => {
    answers.artist_card = [
      card({
        type: null,
        begin_area: 'Strasbourg',
        y0: 2012,
        y0_source: 'first_album',
        ended: false,
      }),
    ];

    expect((await getArtistIdentity(DAFT_PUNK))?.facts).toEqual({
      kind: null,
      place: null,
      country: 'FR',
      formed: null,
      ended: null,
      active: false,
    });
  });

  it('says no year it inferred, and an ongoing group is active', async () => {
    answers.artist_card = [
      card({ y0_source: 'first_album', y_end: 2024, y_end_source: 'last_album', ended: false }),
    ];

    expect((await getArtistIdentity(DAFT_PUNK))?.facts).toMatchObject({
      formed: null,
      ended: null,
      active: true,
    });
  });

  it('names no dissolved country nor MusicBrainz region, Kosovo it does', async () => {
    const countryOf = async (code: string) => {
      identityCache.dispose();
      coreCache.dispose();
      answers.artist_card = [card({ country: code })];
      return (await getArtistIdentity(DAFT_PUNK))?.facts.country;
    };

    expect(await countryOf('SU')).toBeNull();
    expect(await countryOf('YU')).toBeNull();
    expect(await countryOf('XW')).toBeNull();
    expect(await countryOf('XK')).toBe('XK');
  });

  it('leaves out a begin area that only repeats the country', async () => {
    answers.artist_card = [card({ country: 'US', begin_area: 'United States' })];

    expect((await getArtistIdentity(DAFT_PUNK))?.facts).toMatchObject({
      place: null,
      country: 'US',
    });
  });

  it('names no Wikidata item when the dump links two', async () => {
    answers.artist_urls = [...urls, { type: 'wikidata', url: 'https://www.wikidata.org/wiki/Q1' }];

    expect((await getArtistIdentity(DAFT_PUNK))?.wikidataId).toBeNull();
  });

  it('knows no artist the dump does not hold, and says when musilogy is not loaded', async () => {
    answers.artist_card = [];
    expect(await getArtistIdentity(DAFT_PUNK)).toBeNull();

    identityCache.dispose();
    coreCache.dispose();
    loaded = false;
    const failure = await getArtistIdentity(DAFT_PUNK).catch((err: unknown) => err);
    expect(failure).toBeInstanceOf(MusilogyUnavailable);
  });
});

describe('an artist page', () => {
  it('reads the card and the records once for the profile and the sections', async () => {
    // Breaks if getArtistIdentity and getMusilogyArtist each query them again:
    // one page view asks for both.
    await getArtistIdentity(DAFT_PUNK);
    await getMusilogyArtist(DAFT_PUNK);
    expect(asked.filter((fn) => fn === 'artist_card')).toHaveLength(1);
    expect(asked.filter((fn) => fn === 'artist_releases')).toHaveLength(1);
  });
});

const neighbourRow = (name: string, rank: number, values: Record<string, unknown> = {}) => ({
  mbid: `00000000-0000-4000-8000-${String(rank).padStart(12, '0')}`,
  name,
  disambiguation: null,
  y0: 1990,
  y_end: null,
  ended: false,
  rank,
  ...values,
});

describe('getMusilogyArtist', () => {
  it('reads each tab in the order its function gives, never re-sorted', async () => {
    answers.artist_same_sound = [
      neighbourRow('Cassius', 1, { term: 'French House' }),
      neighbourRow('Bob Sinclar', 2, { term: 'French House' }),
    ];
    answers.artist_colisten = [neighbourRow('Justice', 2), neighbourRow('Gorillaz', 1)];
    answers.artist_credits = [
      { mbid: 'p', name: 'Pharrell Williams', disambiguation: null, y0: 1992, records: 2 },
      { mbid: 'n', name: 'Nile Rodgers', disambiguation: null, y0: 1970, records: 1 },
    ];

    const page = await getMusilogyArtist(DAFT_PUNK);

    expect(page?.sameSound?.map((n) => [n.name, n.rank, n.term])).toEqual([
      ['Cassius', 1, 'French House'],
      ['Bob Sinclar', 2, 'French House'],
    ]);
    expect(page?.colisten?.map((n) => [n.name, n.term])).toEqual([
      ['Justice', null],
      ['Gorillaz', null],
    ]);
    expect(page?.credits?.map((c) => [c.name, c.records])).toEqual([
      ['Pharrell Williams', 2],
      ['Nile Rodgers', 1],
    ]);
  });

  it('leaves out a tab whose function a load predates, keeps the others', async () => {
    missing = new Set(['artist_colisten', 'artist_credits']);
    answers.artist_same_sound = [neighbourRow('Cassius', 1, { term: 'French House' })];

    const page = await getMusilogyArtist(DAFT_PUNK);

    expect(page?.colisten).toBeNull();
    expect(page?.credits).toBeNull();
    expect(page?.sameSound).toHaveLength(1);
  });
});
