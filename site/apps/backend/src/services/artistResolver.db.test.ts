import { afterAll, beforeAll, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { db, pool } from '../db';
import { artist, artistProfile, artistSlug, radioPlay } from '../db/schema';
import { artistKey } from '../lib/artistName';
import type { Lookup } from '../lib/lookup';
import { assertTestDatabase, emptyArtistTables, installMusilogyRanks, setRanks } from '../test/pg';
import * as musicbrainz from './musicbrainzService';
import type { IsrcRecording } from './musicbrainzService';
import * as onAir from './nowPlaying';
import type { NowPlayingTrack } from './nowPlaying';
import { resolveArtist, reverifyArtist } from './artistResolver';

// The resolver against the real database: rows, slugs, profiles and the unique indexes are
// Postgres's. The boundaries are MusicBrainz's answers and the track on air.
let isrcLookup: Lookup<IsrcRecording[]> = { status: 'none' };
let titleLookup: Lookup<IsrcRecording[]> = { status: 'none' };
let declaredDeezerId: Lookup<string> = { status: 'none' };
let nowPlaying: NowPlayingTrack | null = null;
// When set, MusicBrainz is the real service behind a mocked fetch.
let live = false;

const real = {
  isrc: musicbrainz.findRecordingsByIsrc,
  title: musicbrainz.findRecordingsByTitle,
  declared: musicbrainz.findDeezerIdByMbid,
};
const spies = {
  onAir: spyOn(onAir, 'fetchNowPlaying').mockImplementation(() => Promise.resolve(nowPlaying)),
  isrc: spyOn(musicbrainz, 'findRecordingsByIsrc').mockImplementation((isrc) =>
    live ? real.isrc(isrc) : Promise.resolve(isrcLookup)
  ),
  title: spyOn(musicbrainz, 'findRecordingsByTitle').mockImplementation((name, title) =>
    live ? real.title(name, title) : Promise.resolve(titleLookup)
  ),
  declared: spyOn(musicbrainz, 'findDeezerIdByMbid').mockImplementation((mbid) =>
    live ? real.declared(mbid) : Promise.resolve(declaredDeezerId)
  ),
};

beforeAll(async () => {
  await assertTestDatabase();
  await installMusilogyRanks();
});

beforeEach(async () => {
  await emptyArtistTables();
  await db.execute(sql`TRUNCATE radio_play`);
  await setRanks({});
  isrcLookup = { status: 'none' };
  titleLookup = { status: 'none' };
  declaredDeezerId = { status: 'none' };
  nowPlaying = null;
  live = false;
  for (const spy of Object.values(spies)) spy.mockClear();
});

afterAll(async () => {
  for (const spy of Object.values(spies)) spy.mockRestore();
  await pool.end();
});

const recording = (title: string, ...credits: Array<[string, string]>): IsrcRecording => ({
  title,
  credits: credits.map(([mbid, name]) => ({ mbid, names: [name] })),
});
const found = <T>(value: T): Lookup<T> => ({ status: 'found', value });

let shId = 0;
async function played(artistName: string, title: string, isrc: string | null = null) {
  shId += 1;
  await db.insert(radioPlay).values({
    id: randomUUID(),
    shId,
    title,
    artist: artistName,
    artistNormalized: artistKey(artistName),
    isrc,
  });
}

type Known = {
  id: string;
  name: string;
  mbid?: string | null;
  deezerId?: string | null;
  identifiedBy?: 'isrc' | 'name';
  slug: string;
};
/** A known artist, its page at `slug`: its MBID's page when it has one, else its row's. */
async function known({ id, name, mbid = null, deezerId = null, identifiedBy, slug }: Known) {
  await db.insert(artist).values({
    id,
    normalizedName: artistKey(name),
    displayName: name,
    mbid,
    deezerId,
    ...(identifiedBy ? { identifiedBy } : {}),
  });
  await db.insert(artistSlug).values(mbid ? { slug, mbid } : { slug, artistId: id });
}

const rows = () => db.select().from(artist).orderBy(artist.id);
const rowNamed = async (name: string) =>
  (
    await db
      .select()
      .from(artist)
      .where(eq(artist.normalizedName, artistKey(name)))
  )[0];
const profiles = () => db.select().from(artistProfile);

describe('resolveArtist', () => {
  it('returns a known artist without asking any source', async () => {
    await known({ id: 'a-1', name: 'Air', mbid: 'mb-air', identifiedBy: 'isrc', slug: 'air' });

    expect(await resolveArtist('Air')).toEqual({ id: 'a-1', slug: 'air' });
    expect(spies.isrc).not.toHaveBeenCalled();
    expect(spies.title).not.toHaveBeenCalled();
  });

  it('creates no page for a name the antenna never played', async () => {
    nowPlaying = { sh_id: 1, title: 'X', artist: 'Someone Else', isrc: null, artId: null };

    expect(await resolveArtist('Buy Cheap Pills')).toBeNull();
    expect(spies.title).not.toHaveBeenCalled();
    expect(await rows()).toEqual([]);
  });

  it('accepts the artist on air before the watcher has recorded it', async () => {
    nowPlaying = {
      sh_id: 1,
      title: 'Kelly Watch the Stars',
      artist: 'Air feat. Someone',
      isrc: null,
      artId: null,
    };

    expect(await resolveArtist('Air')).toMatchObject({ slug: 'air' });
    expect(spies.title.mock.calls).toEqual([['Air', 'Kelly Watch the Stars']]);
    expect(await rows()).toHaveLength(1);
  });

  it('gives an artist MusicBrainz does not know a page of its own, under the played spelling', async () => {
    await played('Unsigned Band feat. Friend', 'Kelly Watch the Stars');

    const resolved = await resolveArtist('Unsigned Band feat. Friend');

    expect(resolved?.slug).toBe('unsigned-band');
    expect(await rowNamed('Unsigned Band')).toMatchObject({
      displayName: 'Unsigned Band',
      deezerId: null,
      mbid: null,
      identifiedBy: 'name',
    });
    expect(spies.declared).not.toHaveBeenCalled();
  });

  it.each([
    ['the played title', () => (titleLookup = { status: 'failed' }), null],
    ['the ISRC', () => (isrcLookup = { status: 'failed' }), 'GBDUW0000053'],
    [
      'the Deezer link MusicBrainz declares',
      () => {
        isrcLookup = found([recording('One More Time', ['mb-dp', 'Daft Punk'])]);
        declaredDeezerId = { status: 'failed' };
      },
      'GBDUW0000053',
    ],
  ])(
    'persists nothing while MusicBrainz fails on %s, so the next call retries',
    async (_, fail, isrc) => {
      await played('Daft Punk', 'One More Time', isrc);
      fail();

      expect(await resolveArtist('Daft Punk')).toBeNull();
      expect(await rows()).toEqual([]);
    }
  );

  it('gives a homonym the next free suffix, never a slug another page holds', async () => {
    await known({ id: 'other-1', name: 'Cassius UK', slug: 'cassius' });
    await known({ id: 'other-2', name: 'Cassius US', slug: 'cassius-2' });
    await played('Cassius', 'Feeling for You');

    expect(await resolveArtist('Cassius')).toMatchObject({ slug: 'cassius-3' });
  });

  it('gives a name written without Latin letters a slug in its own script', async () => {
    await played('Кино', 'Группа крови');

    expect(await resolveArtist('Кино')).toMatchObject({ slug: 'кино' });
  });
});

describe('never by name alone', () => {
  it('asks MusicBrainz for the played title under the played name, never for the name', async () => {
    await played('Cassius', 'Cassius 1999');

    await resolveArtist('Cassius');

    expect(spies.title.mock.calls).toEqual([['Cassius', 'Cassius 1999']]);
  });

  it('searches nothing when the played title is only a version', async () => {
    await played('Cassius', '(Live)');

    await resolveArtist('Cassius');

    expect(spies.title).not.toHaveBeenCalled();
    expect(await rowNamed('Cassius')).toMatchObject({ mbid: null, deezerId: null });
  });

  it.each([
    [
      'the name recorded only other titles',
      'Cassius',
      'Feeling for You',
      [recording('Cassius 1999', ['mb-cassius', 'Cassius'])],
    ],
    ['a longer title', 'Home Band', 'Home', [recording('Home Again', ['mb-home', 'Home Band'])]],
    [
      'a title two artists of that name recorded',
      'BODEGA',
      'How Did This Happen?!',
      [
        recording('How Did This Happen?!', ['mb-1', 'BODEGA']),
        recording('How Did This Happen?!', ['mb-2', 'Bodega']),
      ],
    ],
  ])('binds no MBID from %s', async (_, name, title, recordings) => {
    await played(name, title);
    titleLookup = found(recordings);

    await resolveArtist(name);

    expect(await rowNamed(name)).toMatchObject({ mbid: null, deezerId: null });
  });
});

describe('identity by the played title', () => {
  it('finds the MBID through a recording of the played title credited to the name', async () => {
    await played('Talulah Gosh', 'Talulah Gosh');
    titleLookup = found([
      recording('Talulah Gosh', ['mb-tg', 'Talulah Gosh']),
      // Another song, and the same title under another artist: neither counts.
      recording('Steaming Train', ['mb-other', 'Talulah Gosh']),
      recording('Talulah Gosh', ['mb-cover', 'Someone Else']),
    ]);
    declaredDeezerId = found('1202408');

    await resolveArtist('Talulah Gosh');

    expect(spies.declared.mock.calls).toEqual([['mb-tg']]);
    expect(await rowNamed('Talulah Gosh')).toMatchObject({
      mbid: 'mb-tg',
      deezerId: '1202408',
      identifiedBy: 'name',
    });
  });

  it('searches a title without its version', async () => {
    await played('Talulah Gosh', 'Testcard Girl (2011 Remaster)');

    await resolveArtist('Talulah Gosh');

    expect(spies.title.mock.calls).toEqual([['Talulah Gosh', 'Testcard Girl']]);
  });
});

describe('identity by ISRC', () => {
  const ISRC = 'GBDUW0000053';
  const DAFT_PUNK = [recording('One More Time', ['mb-dp', 'Daft Punk'])];

  it('identifies a new artist by an ISRC whose recording is the played track', async () => {
    await played('Daft Punk', 'One More Time', ISRC);
    isrcLookup = found(DAFT_PUNK);
    declaredDeezerId = found('27');

    await resolveArtist('Daft Punk');

    expect(spies.title).not.toHaveBeenCalled();
    expect(await rowNamed('Daft Punk')).toMatchObject({
      displayName: 'Daft Punk',
      deezerId: '27',
      mbid: 'mb-dp',
      identifiedBy: 'isrc',
    });
  });

  it('takes the Deezer artist only from the link MusicBrainz declares', async () => {
    await played('Daft Punk', 'One More Time', ISRC);
    isrcLookup = found(DAFT_PUNK);

    await resolveArtist('Daft Punk');

    expect(await rowNamed('Daft Punk')).toMatchObject({ deezerId: null, mbid: 'mb-dp' });
  });

  it('names a new played artist by its MBID page, the slug that page already has', async () => {
    await setRanks({ 'mb-dp': 1 });
    await db.insert(artistSlug).values({ slug: 'daft-punk-fr', mbid: 'mb-dp' });
    await played('Daft Punk', 'One More Time', ISRC);
    isrcLookup = found(DAFT_PUNK);

    expect(await resolveArtist('Daft Punk')).toMatchObject({ slug: 'daft-punk-fr' });
    // No new slug: the page's address, already shared, is the played artist's.
    expect(await db.select().from(artistSlug)).toEqual([
      { slug: 'daft-punk-fr', mbid: 'mb-dp', artistId: null },
    ]);
  });

  it("gives a new played artist's MBID page a slug when it has none yet, and the row none", async () => {
    await setRanks({ 'mb-dp': 1 });
    await played('Daft Punk', 'One More Time', ISRC);
    isrcLookup = found(DAFT_PUNK);

    expect(await resolveArtist('Daft Punk')).toMatchObject({ slug: 'daft-punk' });
    expect(await db.select().from(artistSlug)).toEqual([
      { slug: 'daft-punk', mbid: 'mb-dp', artistId: null },
    ]);
  });

  it('names a new played artist by its row while Musilogy cannot rank its MBID yet', async () => {
    // Newer in MusicBrainz than the loaded dump: its slug goes to the MBID's page once that page
    // is published (artistSlugs.adoptRowSlugs), never to a homonym's plain name meanwhile.
    await setRanks({});
    await played('Daft Punk', 'One More Time', ISRC);
    isrcLookup = found(DAFT_PUNK);

    expect(await resolveArtist('Daft Punk')).toMatchObject({ slug: 'daft-punk' });
    const row = await rowNamed('Daft Punk');
    expect(await db.select().from(artistSlug)).toEqual([
      { slug: 'daft-punk', mbid: null, artistId: row?.id ?? 'no row' },
    ]);
  });

  it('takes the credited artist bearing the played name, not the first credited', async () => {
    await played('Played Name', 'Something', ISRC);
    isrcLookup = found([
      recording('Something', ['mb-a', 'Another Artist'], ['mb-b', 'Played Name']),
    ]);

    await resolveArtist('Played Name');

    expect(await rowNamed('Played Name')).toMatchObject({ mbid: 'mb-b', identifiedBy: 'isrc' });
  });

  // Measured in production on 2026-10-04: Paul McCartney's track, whose ISRC
  // MusicBrainz credits to Wings, had made his page Wings'.
  it('does not take another artist credited on the ISRC, and turns to the played title', async () => {
    await played('Paul McCartney', 'Band on the Run', 'GBCCS1500158');
    isrcLookup = found([recording('Band on the Run', ['mb-wings', 'Wings'])]);
    titleLookup = found([recording('Band on the Run', ['mb-paul', 'Paul McCartney'])]);

    await resolveArtist('Paul McCartney');

    expect(await rowNamed('Paul McCartney')).toMatchObject({
      mbid: 'mb-paul',
      identifiedBy: 'name',
    });
  });

  // Daniel Avery's « Illusion Of Time » had its ISRC filed on ANNA's « Dissolution ».
  it('does not take a recording of another title', async () => {
    await played('Daniel Avery', 'Illusion Of Time', 'GBTZZ2000002');
    isrcLookup = found([recording('Dissolution', ['mb-anna', 'Daniel Avery'])]);

    await resolveArtist('Daniel Avery');

    expect(await rowNamed('Daniel Avery')).toMatchObject({ mbid: null, identifiedBy: 'name' });
  });

  it('re-identifies a row bound by its name once a checked ISRC tells better, and drops its profile', async () => {
    // Can was bound by name to a one-album homonym on Deezer (measured 2026-10-03).
    await setRanks({ 'mb-homonym': 1, 'mb-can': 1 });
    await known({
      id: 'a-can',
      name: 'Can',
      mbid: 'mb-homonym',
      deezerId: '366546802',
      identifiedBy: 'name',
      slug: 'can',
    });
    await db.insert(artistProfile).values({ artistId: 'a-can', refreshedAt: new Date() });
    await played('Can', 'Vitamin C', 'DEAE87200093');
    isrcLookup = found([recording('Vitamin C', ['mb-can', 'Can'])]);
    declaredDeezerId = found('8213');

    // The page is now its MBID's, at a slug of its own: « can » stays the homonym's page's.
    expect(await resolveArtist('Can')).toEqual({ id: 'a-can', slug: 'can-2' });
    expect(await rowNamed('Can')).toMatchObject({
      deezerId: '8213',
      mbid: 'mb-can',
      identifiedBy: 'isrc',
    });
    expect(await profiles()).toEqual([]);
  });

  it('leaves a row identified by its ISRC alone', async () => {
    await known({
      id: 'a-27',
      name: 'Daft Punk',
      mbid: 'mb-dp',
      deezerId: '27',
      identifiedBy: 'isrc',
      slug: 'daft-punk',
    });
    await played('Daft Punk', 'One More Time', ISRC);

    await resolveArtist('Daft Punk');

    expect(spies.isrc).not.toHaveBeenCalled();
    expect(await rowNamed('Daft Punk')).toMatchObject({ mbid: 'mb-dp', deezerId: '27' });
  });

  it("gives another spelling of an identified artist that artist's page", async () => {
    await known({
      id: 'a-kittin',
      name: 'Kittin',
      mbid: 'mb-kittin',
      deezerId: '1234',
      identifiedBy: 'isrc',
      slug: 'kittin',
    });
    await played('Miss Kittin', 'Frank Sinatra', 'FR0W60100020');
    isrcLookup = found([recording('Frank Sinatra', ['mb-kittin', 'Miss Kittin'])]);
    declaredDeezerId = found('1234');

    expect(await resolveArtist('Miss Kittin')).toEqual({ id: 'a-kittin', slug: 'kittin' });
    expect(await rows()).toHaveLength(1);
  });
});

describe('the MBID of a known row, pivot to Musilogy', () => {
  const talulah = () => known({ id: 'a-tg', name: 'Talulah Gosh', slug: 'talulah-gosh' });

  it("takes the MBID its played title now finds, its slug becoming the MBID page's", async () => {
    await talulah();
    await played('Talulah Gosh', 'Talulah Gosh');
    titleLookup = found([recording('Talulah Gosh', ['mb-tg', 'Talulah Gosh'])]);
    declaredDeezerId = found('1202408');

    expect(await resolveArtist('Talulah Gosh')).toEqual({ id: 'a-tg', slug: 'talulah-gosh' });
    expect(await rowNamed('Talulah Gosh')).toMatchObject({
      deezerId: '1202408',
      mbid: 'mb-tg',
      identifiedBy: 'name',
    });
    expect(await db.select().from(artistSlug)).toEqual([
      { slug: 'talulah-gosh', mbid: 'mb-tg', artistId: null },
    ]);
  });

  it('writes nothing while nothing is found', async () => {
    await talulah();
    await played('Talulah Gosh', 'Talulah Gosh');

    expect(await resolveArtist('Talulah Gosh')).toEqual({ id: 'a-tg', slug: 'talulah-gosh' });
    expect(await rowNamed('Talulah Gosh')).toMatchObject({ mbid: null, deezerId: null });
  });

  it('leaves a known MBID alone', async () => {
    await known({ id: 'a-tg', name: 'Talulah Gosh', mbid: 'mb-tg', slug: 'talulah-gosh' });
    await played('Talulah Gosh', 'Talulah Gosh');

    await resolveArtist('Talulah Gosh');

    expect(spies.title).not.toHaveBeenCalled();
  });

  it('still resolves the artist when another row already holds the MBID', async () => {
    await known({ id: 'a-other', name: 'Talulah Gosh UK', mbid: 'mb-tg', slug: 'tg-uk' });
    await talulah();
    await played('Talulah Gosh', 'Talulah Gosh');
    titleLookup = found([recording('Talulah Gosh', ['mb-tg', 'Talulah Gosh'])]);

    expect(await resolveArtist('Talulah Gosh')).toEqual({ id: 'a-tg', slug: 'talulah-gosh' });
    expect(await rowNamed('Talulah Gosh')).toMatchObject({ mbid: null });
  });

  it('lets any other write failure surface', async () => {
    await talulah();
    await played('Talulah Gosh', 'Talulah Gosh');
    titleLookup = found([recording('Talulah Gosh', ['mb-tg', 'Talulah Gosh'])]);
    const update = spyOn(db, 'update').mockImplementationOnce(() => {
      throw new Error('connection terminated');
    });

    try {
      expect(await resolveArtist('Talulah Gosh').catch((err: unknown) => err)).toEqual(
        new Error('connection terminated')
      );
    } finally {
      update.mockRestore();
    }
  });
});

describe('the sources asked', () => {
  // Deezer's terms allow only private use and no « data » generated from the API (§IV):
  // https://developers.deezer.com/termsofuse
  it('identifies an artist through MusicBrainz alone, never Deezer', async () => {
    const asked: string[] = [];
    const fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(((input: string | URL) => {
      const url = String(input);
      asked.push(url);
      // One request a second is the service's own pace: not this test's to wait for.
      musicbrainz.__resetMusicbrainzThrottle();
      if (url.includes('/isrc/')) {
        return Promise.resolve(
          Response.json({
            recordings: [
              {
                title: 'One More Time',
                'artist-credit': [
                  { name: 'Daft Punk', artist: { id: 'mb-dp', name: 'Daft Punk' } },
                ],
              },
            ],
          })
        );
      }
      // No Deezer link declared, no recording found by title.
      return Promise.resolve(
        Response.json(url.includes('/artist/') ? { relations: [] } : { recordings: [] })
      );
    }) as typeof fetch);
    live = true;
    try {
      await played('Daft Punk', 'One More Time', 'GBDUW0000053');
      await resolveArtist('Daft Punk');
      await played('Unsigned Band', 'Unknown Song');
      await resolveArtist('Unsigned Band');
    } finally {
      fetchSpy.mockRestore();
      musicbrainz.musicbrainzCache.dispose();
    }

    expect(asked.length).toBeGreaterThan(0);
    expect(asked.filter((url) => !url.startsWith('https://musicbrainz.org/'))).toEqual([]);
    const identities = (await rows()).map((row) => [row.displayName, row.mbid, row.deezerId]);
    expect(identities.sort()).toEqual([
      ['Daft Punk', 'mb-dp', null],
      ['Unsigned Band', null, null],
    ]);
  });
});

describe('reverifyArtist', () => {
  it('replaces an identity an unchecked ISRC gave, whole, and drops its profile', async () => {
    // Paul McCartney's row held Wings' identity, marked as found by ISRC.
    await known({
      id: 'a-paul',
      name: 'Paul McCartney',
      mbid: 'mb-wings',
      deezerId: '2709',
      identifiedBy: 'isrc',
      slug: 'paul-mccartney',
    });
    await db.insert(artistProfile).values({ artistId: 'a-paul', refreshedAt: new Date() });
    await played('Paul McCartney', 'Band on the Run', 'GBCCS1500158');
    isrcLookup = found([recording('Band on the Run', ['mb-wings', 'Wings'])]);
    titleLookup = found([recording('Band on the Run', ['mb-paul', 'Paul McCartney'])]);
    declaredDeezerId = found('1');

    expect(await reverifyArtist('paul mccartney', 'Paul McCartney')).toBe('changed');
    expect(await rowNamed('Paul McCartney')).toMatchObject({
      deezerId: '1',
      mbid: 'mb-paul',
      identifiedBy: 'name',
    });
    expect(await profiles()).toEqual([]);
  });

  it('clears a Deezer artist MusicBrainz does not declare, the identity and profile kept', async () => {
    await known({
      id: 'a-dp',
      name: 'Daft Punk',
      mbid: 'mb-dp',
      deezerId: '27',
      identifiedBy: 'isrc',
      slug: 'daft-punk',
    });
    await db.insert(artistProfile).values({ artistId: 'a-dp', refreshedAt: new Date() });
    await played('Daft Punk', 'One More Time', 'GBDUW0000053');
    isrcLookup = found([recording('One More Time', ['mb-dp', 'Daft Punk'])]);

    expect(await reverifyArtist('daft punk', 'Daft Punk')).toBe('same');
    expect(await rowNamed('Daft Punk')).toMatchObject({
      deezerId: null,
      mbid: 'mb-dp',
      identifiedBy: 'isrc',
    });
    // The Deezer id is a link, not the identity: the profile stays.
    expect(await profiles()).toHaveLength(1);
  });
});
