import { beforeEach, describe, expect, it, mock } from 'bun:test';
import { DrizzleQueryError, type SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';

import * as realSchema from '../db/schema';
import { __resetRateLimits } from '../lib/rateLimit';

// The SQL itself is tested in musilogy against Postgres; here the database is
// a double that answers by the musilogy function a query calls, read from the
// SQL drizzle actually builds.
const dialect = new PgDialect();
let answers: Record<string, Array<Record<string, unknown>>> = {};
let notLoaded = new Set<string>();
let pageRows: Array<{ id: string; slug: string; mbid: string | null }> = [];

function answer(query: SQL) {
  const built = dialect.sqlToQuery(query);
  const fn = /musilogy\.(\w+)\(/.exec(built.sql)?.[1] ?? '';
  if (notLoaded.has(fn)) {
    // What drizzle throws when Postgres knows no such function: code as cause.
    return Promise.reject(
      new DrizzleQueryError(
        built.sql,
        built.params,
        Object.assign(new Error(`function musilogy.${fn} does not exist`), { code: '42883' })
      )
    );
  }
  return Promise.resolve({ rows: answers[fn] ?? [] });
}

void mock.module('../db/index', () => ({
  schema: realSchema,
  db: {
    execute: answer,
    select: () => ({
      from: () => ({ innerJoin: () => ({ where: () => Promise.resolve(pageRows) }) }),
    }),
  },
}));

const { musilogyRoutes } = await import('./musilogy.routes');
const { coreCache, musilogyCache } = await import('../services/musilogyService');

const T_REX = 'c842d29f-a297-48cd-bb71-4f77fd672b16';
const BOWIE = '5441c29d-3602-4898-b1a1-b77fa23b8e50';
const KINKS = '17b53d9f-5c63-4a09-a593-dde4608e0db9';
const RAMONES = 'd6ed7887-a401-47a8-893c-34b967444d26';
const BOLAN = '7c6ae5b6-1f46-4ed3-a3a5-f0d3d4a3b6c7';
const TOOK = '3f2a1b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b';

const card = {
  mbid: T_REX,
  name: 'T. Rex',
  disambiguation: 'British glam rock band',
  type: 'Group',
  country: 'GB',
  begin_area: 'London',
  y_birth: null,
  y0: 1967,
  y0_source: 'declared',
  y_end: 1977,
  y_end_source: 'declared',
  ended: true,
  genres: [{ mbid: 'g-1', name: 'glam rock', votes: 9 }],
  genre_source: 'declared',
  listen_count: '1234567',
  user_count: '31415',
  proximity_surveyed: true,
};

const neighbour = (mbid: string, name: string, y0: number | null, side: string | null) => ({
  mbid,
  name,
  disambiguation: null,
  type: 'Group',
  y0,
  y_end: null,
  ended: null,
  score: 1000,
  rank: 1,
  side,
});

function get(path: string, ip = '203.0.113.1'): Promise<Response> {
  return musilogyRoutes.handle(
    new Request(`http://localhost/api/musilogy${path}`, { headers: { 'x-real-ip': ip } })
  );
}

beforeEach(() => {
  answers = {};
  notLoaded = new Set();
  pageRows = [];
  musilogyCache.dispose();
  coreCache.dispose();
  __resetRateLimits();
});

describe('GET /api/musilogy/artist/:mbid', () => {
  it('places each neighbour before, during or after the artist, as musilogy says', async () => {
    answers = {
      artist_card: [card],
      artist_neighbours: [
        neighbour(KINKS, 'The Kinks', 1963, 'before'),
        neighbour(BOWIE, 'David Bowie', 1964, 'during'),
        neighbour(RAMONES, 'Ramones', 1974, 'after'),
        neighbour('0bfba3d3-6a04-4779-bb0a-df07df5b0558', 'Undated', null, null),
      ],
      artist_influences: [],
    };
    pageRows = [{ id: 'a-bowie', slug: 'david-bowie', mbid: BOWIE }];

    const res = await get(`/artist/${T_REX.toUpperCase()}`);
    const body = (await res.json()) as {
      card: { name: string; genres: string[]; played: unknown };
      neighbours: Record<string, Array<{ name: string; played: unknown }>>;
    };

    expect(res.status).toBe(200);
    expect(body.card).toMatchObject({
      name: 'T. Rex',
      genres: ['glam rock'],
    });
    expect(body.neighbours.before!.map((n) => n.name)).toEqual(['The Kinks']);
    expect(body.neighbours.during![0]).toMatchObject({
      name: 'David Bowie',
      played: { id: 'a-bowie', slug: 'david-bowie' },
    });
    expect(body.neighbours.after!.map((n) => n.name)).toEqual(['Ramones']);
    expect(body.neighbours.undated!.map((n) => n.name)).toEqual(['Undated']);
  });

  it("gives the work, the band, the members' projects and other names, as musilogy reads them", async () => {
    const person = (mbid: string, name: string, y0: number | null = null) => ({
      mbid,
      name,
      disambiguation: null,
      y0,
    });
    answers = {
      artist_card: [card],
      artist_releases: [
        {
          mbid: 'rg-unicorn',
          title: 'Unicorn',
          primary_type: 'Album',
          soundtrack: false,
          remix: false,
          y: 1969,
        },
        {
          mbid: 'rg-ride',
          title: 'Ride a White Swan',
          primary_type: 'EP',
          soundtrack: false,
          remix: false,
          y: null,
        },
      ],
      artist_bands: [
        { role: 'member', ...person(BOLAN, 'Marc Bolan', 1965), y_begin: 1967, y_end: 1977 },
        { role: 'member', ...person(TOOK, 'Steve Peregrine Took'), y_begin: 1967, y_end: 1969 },
      ],
      artist_member_projects: [
        { ...person(KINKS, 'Shagrat', 1970), via: ['Steve Peregrine Took'] },
      ],
      artist_other_names: [{ kind: 'former', ...person(RAMONES, 'Tyrannosaurus Rex', 1967) }],
    };
    pageRows = [{ id: 'a-bolan', slug: 'marc-bolan', mbid: BOLAN }];

    const body = (await (await get(`/artist/${T_REX}`)).json()) as Record<string, unknown>;

    expect(body.releases).toEqual([
      {
        mbid: 'rg-unicorn',
        title: 'Unicorn',
        type: 'album',
        soundtrack: false,
        remix: false,
        year: 1969,
      },
      {
        mbid: 'rg-ride',
        title: 'Ride a White Swan',
        type: 'ep',
        soundtrack: false,
        remix: false,
        year: null,
      },
    ]);
    expect(body.bands).toMatchObject({
      members: [
        { name: 'Marc Bolan', yBegin: 1967, yEnd: 1977, played: { slug: 'marc-bolan' } },
        { name: 'Steve Peregrine Took', yBegin: 1967, yEnd: 1969, played: null },
      ],
      groups: [],
    });
    expect(body.memberProjects).toMatchObject([{ name: 'Shagrat', via: ['Steve Peregrine Took'] }]);
    expect(body.otherNames).toMatchObject([{ name: 'Tyrannosaurus Rex', kind: 'former' }]);
  });

  it('splits influences the artist cites from those that cite it', async () => {
    const influence = (direction: string, mbid: string, name: string) => ({
      direction,
      mbid,
      name,
      disambiguation: null,
      y0: null,
      statement: `Q1$${name}`,
    });
    answers = {
      artist_card: [card],
      artist_neighbours: [],
      artist_influences: [
        influence('cited', KINKS, 'The Kinks'),
        influence('cited_by', RAMONES, 'Ramones'),
      ],
    };

    const body = (await (await get(`/artist/${T_REX}`)).json()) as {
      influences: { cites: Array<{ name: string }>; citedBy: Array<{ name: string }> };
    };

    expect(body.influences.cites.map((i) => i.name)).toEqual(['The Kinks']);
    expect(body.influences.citedBy.map((i) => i.name)).toEqual(['Ramones']);
  });

  it('says a section is unknown, not empty, while its data is not loaded', async () => {
    answers = { artist_card: [card] };
    notLoaded = new Set([
      'artist_neighbours',
      'artist_influences',
      'artist_releases',
      'artist_bands',
      'artist_member_projects',
      'artist_other_names',
    ]);

    const body = (await (await get(`/artist/${T_REX}`)).json()) as Record<string, unknown>;

    expect(body.neighbours).toBeNull();
    expect(body.influences).toBeNull();
    expect(body.releases).toBeNull();
    expect(body.bands).toBeNull();
    expect(body.memberProjects).toBeNull();
    expect(body.otherNames).toBeNull();
  });

  it('answers 503 while musilogy is not loaded, 404 for an unknown artist, 400 for a bad id', async () => {
    notLoaded = new Set(['artist_card']);
    expect((await get(`/artist/${T_REX}`)).status).toBe(503);

    notLoaded = new Set();
    expect((await get(`/artist/${BOWIE}`)).status).toBe(404);
    expect((await get('/artist/not-an-mbid')).status).toBe(400);
  });

  it('limits a client to 120 artists a minute', async () => {
    answers = { artist_card: [card] };
    for (let i = 0; i < 120; i += 1) await get(`/artist/${T_REX}`, '198.51.100.7');

    const res = await get(`/artist/${T_REX}`, '198.51.100.7');

    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe('60');
  });
});

describe('GET /api/musilogy/search', () => {
  it('returns the matches, most listened first as musilogy orders them', async () => {
    answers = {
      search_artists: [
        {
          mbid: T_REX,
          name: 'T. Rex',
          disambiguation: null,
          type: 'Group',
          y0: 1967,
          user_count: '31415',
        },
      ],
    };

    const res = await get('/search?q=t.%20rex');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([
      {
        mbid: T_REX,
        name: 'T. Rex',
        disambiguation: null,
        kind: 'group',
        y0: 1967,
      },
    ]);
  });

  it('refuses a query too short to narrow anything', async () => {
    expect((await get('/search?q=a')).status).toBe(400);
    expect((await get('/search')).status).toBe(400);
  });
});
