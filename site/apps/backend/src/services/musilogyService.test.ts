import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { DrizzleQueryError, type SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';

import * as realSchema from '../db/schema';

// The SQL is tested in musilogy against Postgres; here the database answers
// by the musilogy function a query calls, read from the SQL drizzle builds.
const dialect = new PgDialect();
let answers: Record<string, Array<Record<string, unknown>>> = {};
let loaded = true;

function answer(query: SQL) {
  const built = dialect.sqlToQuery(query);
  if (!loaded) {
    return Promise.reject(
      new DrizzleQueryError(
        built.sql,
        built.params,
        Object.assign(new Error('schema "musilogy" does not exist'), { code: '3F000' })
      )
    );
  }
  const fn = /musilogy\.(\w+)\(/.exec(built.sql)?.[1] ?? '';
  return Promise.resolve({ rows: answers[fn] ?? [] });
}

void mock.module('../db/index', () => ({
  schema: realSchema,
  db: {
    execute: answer,
    select: () => ({
      from: () => ({ innerJoin: () => ({ where: () => Promise.resolve([]) }) }),
    }),
  },
}));

const { getArtistIdentity, identityCache, musilogyCache, MusilogyUnavailable } =
  await import('./musilogyService');

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
  genres: [],
  genre_source: null,
  listen_count: null,
  user_count: null,
  proximity_surveyed: null,
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
const releases = [
  { mbid: 'b1c9a6f0-3c8f-3e5a-9a8e-2f1b4c0d9e77', primary_type: 'EP', y: 1994 },
  { mbid: HOMEWORK, primary_type: 'Album', y: 1997 },
];

beforeEach(() => {
  answers = { artist_card: [card()], artist_urls: urls, artist_releases: releases };
  loaded = true;
  identityCache.dispose();
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
      firstCover: `https://coverartarchive.org/release-group/${HOMEWORK}/front-500`,
    });
  });

  it("takes the first EP's cover when there is no album, and none without a record", async () => {
    answers.artist_releases = [releases[0]!];
    expect((await getArtistIdentity(DAFT_PUNK))?.firstCover).toBe(
      `https://coverartarchive.org/release-group/${releases[0]!.mbid}/front-500`
    );

    identityCache.dispose();
    answers.artist_releases = [];
    expect((await getArtistIdentity(DAFT_PUNK))?.firstCover).toBeNull();
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
    loaded = false;
    const failure = await getArtistIdentity(DAFT_PUNK).catch((err: unknown) => err);
    expect(failure).toBeInstanceOf(MusilogyUnavailable);
  });
});
