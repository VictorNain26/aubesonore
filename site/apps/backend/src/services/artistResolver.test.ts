import { describe, it, expect, mock, spyOn, afterAll, beforeEach } from 'bun:test';
import type { Lookup } from '../lib/lookup';
import type { IsrcRecording } from './musicbrainzService';
import { DrizzleQueryError } from 'drizzle-orm';
import type { NowPlayingTrack } from './nowPlaying';

type ArtistRow = {
  id: string;
  slug: string;
  deezerId?: string | null;
  mbid?: string | null;
  identifiedBy?: 'isrc' | 'name';
};
let artistRows: ArtistRow[] = [];
// When set, each artist query answers the next entry: the resolver's lookups in order.
let artistAnswers: ArtistRow[][] | null = null;
let insertConflict = false;
// Slugs already held by other pages, the slug each MBID's page already has, and every slug the
// resolver claimed (artistSlugs.claimSlug).
let takenSlugs = new Set<string>();
let mbidSlugs = new Map<string, string>();
let claimedSlugs: Array<{ slug: string; artistId?: string; mbid?: string }> = [];
// The MBIDs an artist row was bound to (artistSlugs.bindArtistSlug).
let bound: Array<{ artistId: string; mbid: string }> = [];
let isrcLookup: Lookup<IsrcRecording[]> = { status: 'none' };
// What MusicBrainz's search finds under the played title and name.
let titleLookup: Lookup<IsrcRecording[]> = { status: 'none' };
let titleSearches: Array<[string, string]> = [];
let isrcLookups = 0;
// The Deezer artist the MusicBrainz page of an MBID declares, and the MBIDs asked.
let declaredDeezerId: Lookup<string> = { status: 'none' };
let declaredOf: string[] = [];
let deletedProfiles = 0;
let updates: Array<Record<string, unknown>> = [];
let updateError: Error | null = null;
let playRows: Array<{ title: string; isrc?: string | null }> = [];
let inserted: Array<Record<string, unknown>> = [];
let nowPlaying: NowPlayingTrack | null = null;
// When set, MusicBrainz is the real service behind a mocked fetch.
let live = false;

const schema = await import('../db/schema');

const db = {
  select: () => ({
    from: (table: unknown) => {
      const answer = () =>
        Promise.resolve(
          table === schema.radioPlay ? playRows : (artistAnswers?.shift() ?? artistRows)
        );
      const filtered = { where: () => ({ limit: answer, orderBy: () => ({ limit: answer }) }) };
      return { ...filtered, leftJoin: () => ({ leftJoin: () => filtered }) };
    },
  }),
  insert: () => ({
    values: (row: Record<string, unknown>) => ({
      onConflictDoNothing: () => ({
        returning: () => {
          if (insertConflict) return Promise.resolve([]);
          inserted.push(row);
          return Promise.resolve([{ id: row.id }]);
        },
      }),
    }),
  }),
  transaction: <T>(work: (tx: unknown) => Promise<T>) => work(db),
  update: () => ({
    set: (values: Record<string, unknown>) => ({
      where: () => {
        if (updateError) return Promise.reject(updateError);
        updates.push(values);
        return Promise.resolve();
      },
    }),
  }),
  delete: () => ({
    where: () => {
      deletedProfiles += 1;
      return Promise.resolve();
    },
  }),
};

void mock.module('../db', () => ({ schema, db }));

// spyOn on the real exports, restored after this file: mock.module would
// replace these modules for every other test file of the run (Bun 1.3).
const onAir = await import('./nowPlaying');
const musicbrainz = await import('./musicbrainzService');
const slugs = await import('./artistSlugs');
// The real lookups, kept before the spies replace them.
const real = {
  isrc: musicbrainz.findRecordingsByIsrc,
  title: musicbrainz.findRecordingsByTitle,
  declared: musicbrainz.findDeezerIdByMbid,
};

// Every MBID of these tests is in the loaded dump, first of its name.
const rankSpy = spyOn(slugs, 'homonymRank').mockResolvedValue(1);

const spies = [
  spyOn(onAir, 'fetchNowPlaying').mockImplementation(() => Promise.resolve(nowPlaying)),
  spyOn(musicbrainz, 'findRecordingsByIsrc').mockImplementation((isrc) => {
    if (live) return real.isrc(isrc);
    isrcLookups += 1;
    return Promise.resolve(isrcLookup);
  }),
  spyOn(musicbrainz, 'findDeezerIdByMbid').mockImplementation((mbid) => {
    if (live) return real.declared(mbid);
    declaredOf.push(mbid);
    return Promise.resolve(declaredDeezerId);
  }),
  spyOn(musicbrainz, 'findRecordingsByTitle').mockImplementation((name, title) => {
    if (live) return real.title(name, title);
    titleSearches.push([name, title]);
    return Promise.resolve(titleLookup);
  }),
  spyOn(slugs, 'claimSlug').mockImplementation((_ex, owner, name) => {
    const key = 'mbid' in owner ? owner.mbid : owner.artistId;
    const owned = mbidSlugs.get(key);
    if (owned) return Promise.resolve(owned);
    const base = slugify(name);
    if (!base) return Promise.resolve(null);
    const slug = slugs.freeSlug(base, takenSlugs);
    takenSlugs.add(slug);
    mbidSlugs.set(key, slug);
    claimedSlugs.push({ slug, ...owner });
    return Promise.resolve(slug);
  }),
  rankSpy,
  spyOn(slugs, 'bindArtistSlug').mockImplementation((_ex, artistId, mbid) => {
    bound.push({ artistId, mbid });
    return Promise.resolve();
  }),
  // The page slug: its new MBID page's once bound, else the row's own, as claimed or as stored
  // while the row has no MBID.
  spyOn(slugs, 'slugOfArtistPage').mockImplementation((id) => {
    if (bound.some((b) => b.artistId === id)) return Promise.resolve(`page-of-${id}`);
    const row = artistRows.find((r) => r.id === id);
    return Promise.resolve(mbidSlugs.get(id) ?? (row && !row.mbid ? row.slug : null));
  }),
];

afterAll(() => {
  for (const spy of spies) spy.mockRestore();
});

const { resolveArtist, reverifyArtist } = await import('./artistResolver');
const { slugify } = await import('../lib/artistName');

beforeEach(() => {
  artistRows = [];
  artistAnswers = null;
  insertConflict = false;
  takenSlugs = new Set();
  claimedSlugs = [];
  mbidSlugs = new Map();
  bound = [];
  isrcLookup = { status: 'none' };
  isrcLookups = 0;
  titleLookup = { status: 'none' };
  titleSearches = [];
  declaredDeezerId = { status: 'none' };
  declaredOf = [];
  deletedProfiles = 0;
  playRows = [];
  inserted = [];
  nowPlaying = null;
  updates = [];
  updateError = null;
  live = false;
});

const recording = (title: string, ...credits: Array<[string, string]>): IsrcRecording => ({
  title,
  credits: credits.map(([mbid, name]) => ({ mbid, names: [name] })),
});
const found = <T>(value: T): Lookup<T> => ({ status: 'found', value });

describe('resolveArtist', () => {
  it('returns a known artist without asking any source', async () => {
    artistRows = [{ id: 'a-1', slug: 'air', mbid: 'mb-air', identifiedBy: 'isrc' }];

    expect(await resolveArtist('Air')).toEqual({ id: 'a-1', slug: 'air' });
    expect(isrcLookups).toBe(0);
    expect(titleSearches).toEqual([]);
  });

  it('creates no page for a name the antenna never played', async () => {
    nowPlaying = { sh_id: 1, title: 'X', artist: 'Someone Else', isrc: null, artId: null };

    expect(await resolveArtist('Buy Cheap Pills')).toBeNull();
    expect(titleSearches).toEqual([]);
    expect(inserted).toEqual([]);
  });

  it('accepts the artist on air before the watcher has recorded it', async () => {
    nowPlaying = {
      sh_id: 1,
      title: 'Kelly Watch the Stars',
      artist: 'Air feat. Someone',
      isrc: null,
      artId: null,
    };

    expect(await resolveArtist('Air')).not.toBeNull();
    expect(inserted).toHaveLength(1);
    expect(titleSearches).toEqual([['Air', 'Kelly Watch the Stars']]);
  });

  it('persists nothing while MusicBrainz is failing, so the next call retries', async () => {
    playRows = [{ title: 'Kelly Watch the Stars' }];
    titleLookup = { status: 'failed' };

    expect(await resolveArtist('Air')).toBeNull();
    expect(inserted).toEqual([]);
  });

  it('gives an artist MusicBrainz does not know a page of its own, under the played spelling', async () => {
    playRows = [{ title: 'Kelly Watch the Stars' }];

    const resolved = await resolveArtist('Unsigned Band feat. Friend');

    expect(resolved?.slug).toBe('unsigned-band');
    expect(inserted[0]).toMatchObject({
      normalizedName: 'unsigned band',
      displayName: 'Unsigned Band',
      deezerId: null,
      mbid: null,
      identifiedBy: 'name',
    });
    expect(declaredOf).toEqual([]);
  });

  it('gives a homonym the next free suffix, never a slug another artist holds', async () => {
    playRows = [{ title: 'Feeling for You' }];
    takenSlugs = new Set(['cassius', 'cassius-2']);

    expect(await resolveArtist('Cassius')).toMatchObject({ slug: 'cassius-3' });
    expect(claimedSlugs.map((c) => c.slug)).toEqual(['cassius-3']);
  });

  it('resolves a name written without Latin letters', async () => {
    playRows = [{ title: 'Kelly Watch the Stars' }];

    expect(await resolveArtist('Кино')).toMatchObject({ slug: 'кино' });
  });
});

describe('never by name alone', () => {
  it('asks MusicBrainz for the played title under the played name, never for the name', async () => {
    playRows = [{ title: 'Cassius 1999' }];

    await resolveArtist('Cassius');

    expect(titleSearches).toEqual([['Cassius', 'Cassius 1999']]);
  });

  it('binds no MBID when the name recorded only other titles', async () => {
    playRows = [{ title: 'Feeling for You' }];
    titleLookup = found([recording('Cassius 1999', ['mb-cassius', 'Cassius'])]);

    await resolveArtist('Cassius');

    expect(inserted[0]).toMatchObject({ mbid: null, deezerId: null });
  });

  it('searches nothing when the played title is only a version', async () => {
    playRows = [{ title: '(Live)' }];

    await resolveArtist('Cassius');

    expect(titleSearches).toEqual([]);
    expect(inserted[0]).toMatchObject({ mbid: null, deezerId: null });
  });

  it('takes no MBID from a title two artists of that name recorded', async () => {
    playRows = [{ title: 'How Did This Happen?!', isrc: null }];
    titleLookup = found([
      recording('How Did This Happen?!', ['mb-1', 'BODEGA']),
      recording('How Did This Happen?!', ['mb-2', 'Bodega']),
    ]);

    await resolveArtist('BODEGA');

    expect(inserted[0]).toMatchObject({ mbid: null });
  });

  it('takes no MBID from a longer title', async () => {
    playRows = [{ title: 'Home', isrc: null }];
    titleLookup = found([recording('Home Again', ['mb-home', 'Home Band'])]);

    await resolveArtist('Home Band');

    expect(inserted[0]).toMatchObject({ mbid: null });
  });
});

describe('identity by the played title', () => {
  it('finds the MBID through a recording of the played title credited to the name', async () => {
    playRows = [{ title: 'Talulah Gosh', isrc: null }];
    titleLookup = found([
      recording('Talulah Gosh', ['mb-tg', 'Talulah Gosh']),
      // Another song, and the same title under another artist: neither counts.
      recording('Steaming Train', ['mb-other', 'Talulah Gosh']),
      recording('Talulah Gosh', ['mb-cover', 'Someone Else']),
    ]);
    declaredDeezerId = found('1202408');

    await resolveArtist('Talulah Gosh');

    expect(titleSearches).toEqual([['Talulah Gosh', 'Talulah Gosh']]);
    expect(declaredOf).toEqual(['mb-tg']);
    expect(inserted[0]).toMatchObject({ mbid: 'mb-tg', deezerId: '1202408', identifiedBy: 'name' });
  });

  it('searches a title without its version', async () => {
    playRows = [{ title: 'Testcard Girl (2011 Remaster)', isrc: null }];

    await resolveArtist('Talulah Gosh');

    expect(titleSearches).toEqual([['Talulah Gosh', 'Testcard Girl']]);
  });
});

describe('identity by ISRC', () => {
  const ISRC = 'GBDUW0000053';

  it('identifies a new artist by an ISRC whose recording is the played track', async () => {
    playRows = [{ title: 'One More Time', isrc: ISRC }];
    isrcLookup = found([recording('One More Time', ['mb-dp', 'Daft Punk'])]);
    declaredDeezerId = found('27');

    await resolveArtist('Daft Punk');

    expect(titleSearches).toEqual([]);
    expect(inserted[0]).toMatchObject({
      displayName: 'Daft Punk',
      deezerId: '27',
      mbid: 'mb-dp',
      identifiedBy: 'isrc',
    });
  });

  it('takes the Deezer artist only from the link MusicBrainz declares', async () => {
    playRows = [{ title: 'One More Time', isrc: ISRC }];
    isrcLookup = found([recording('One More Time', ['mb-dp', 'Daft Punk'])]);

    await resolveArtist('Daft Punk');

    expect(inserted[0]).toMatchObject({ deezerId: null, mbid: 'mb-dp', identifiedBy: 'isrc' });
  });

  it('persists nothing while the Deezer link MusicBrainz declares cannot be read', async () => {
    playRows = [{ title: 'One More Time', isrc: ISRC }];
    isrcLookup = found([recording('One More Time', ['mb-dp', 'Daft Punk'])]);
    declaredDeezerId = { status: 'failed' };

    expect(await resolveArtist('Daft Punk')).toBeNull();
    expect(inserted).toEqual([]);
  });

  it('names a new played artist by its MBID page, the slug that page already has', async () => {
    playRows = [{ title: 'One More Time', isrc: ISRC }];
    isrcLookup = found([recording('One More Time', ['mb-dp', 'Daft Punk'])]);
    mbidSlugs = new Map([['mb-dp', 'daft-punk']]);

    const resolved = await resolveArtist('Daft Punk');

    expect(resolved?.slug).toBe('daft-punk');
    // No new slug: the page's address, already shared, is the played artist's.
    expect(claimedSlugs).toEqual([]);
  });

  it('names a new played artist by its row while Musilogy cannot rank its MBID yet', async () => {
    // Newer in MusicBrainz than the loaded dump: its slug goes to the MBID's page once that page
    // is published (artistSlugs.adoptRowSlugs), never to a homonym's plain name meanwhile.
    playRows = [{ title: 'One More Time', isrc: ISRC }];
    isrcLookup = found([recording('One More Time', ['mb-dp', 'Daft Punk'])]);
    rankSpy.mockResolvedValueOnce(undefined);

    expect(await resolveArtist('Daft Punk')).toMatchObject({ slug: 'daft-punk' });
    expect(claimedSlugs).toEqual([{ slug: 'daft-punk', artistId: inserted[0]?.id as string }]);
  });

  it("gives a new played artist's MBID page a slug when it has none yet, and the row none", async () => {
    playRows = [{ title: 'One More Time', isrc: ISRC }];
    isrcLookup = found([recording('One More Time', ['mb-dp', 'Daft Punk'])]);

    expect(await resolveArtist('Daft Punk')).toMatchObject({ slug: 'daft-punk' });
    expect(claimedSlugs).toEqual([{ slug: 'daft-punk', mbid: 'mb-dp' }]);
  });

  it('takes the credited artist bearing the played name, not the first credited', async () => {
    playRows = [{ title: 'Something', isrc: ISRC }];
    isrcLookup = found([
      recording('Something', ['mb-a', 'Another Artist'], ['mb-b', 'Played Name']),
    ]);

    await resolveArtist('Played Name');

    expect(inserted[0]).toMatchObject({ mbid: 'mb-b', identifiedBy: 'isrc' });
  });

  // Measured in production on 2026-10-04: Paul McCartney's track, whose ISRC
  // MusicBrainz credits to Wings, had made his page Wings'.
  it('does not take another artist credited on the ISRC, and turns to the played title', async () => {
    playRows = [{ title: 'Band on the Run', isrc: 'GBCCS1500158' }];
    isrcLookup = found([recording('Band on the Run', ['mb-wings', 'Wings'])]);
    titleLookup = found([recording('Band on the Run', ['mb-paul', 'Paul McCartney'])]);

    await resolveArtist('Paul McCartney');

    expect(inserted[0]).toMatchObject({ mbid: 'mb-paul', identifiedBy: 'name' });
  });

  // Daniel Avery's « Illusion Of Time » had its ISRC filed on ANNA's « Dissolution ».
  it('does not take a recording of another title', async () => {
    playRows = [{ title: 'Illusion Of Time', isrc: 'GBTZZ2000002' }];
    isrcLookup = found([recording('Dissolution', ['mb-anna', 'Daniel Avery'])]);

    await resolveArtist('Daniel Avery');

    expect(inserted[0]).toMatchObject({ mbid: null, identifiedBy: 'name' });
  });

  it('persists nothing while a source fails on the ISRC, so the next play retries', async () => {
    playRows = [{ title: 'One More Time', isrc: ISRC }];
    isrcLookup = { status: 'failed' };

    expect(await resolveArtist('Daft Punk')).toBeNull();
    expect(inserted).toEqual([]);
    expect(titleSearches).toEqual([]);
  });

  it('re-identifies a row bound by its name once a checked ISRC tells better, and drops its profile', async () => {
    // Can was bound by name to a one-album homonym on Deezer (measured 2026-10-03).
    artistRows = [
      { id: 'a-can', slug: 'can', deezerId: '366546802', mbid: 'mb-homonym', identifiedBy: 'name' },
    ];
    playRows = [{ title: 'Vitamin C', isrc: 'DEAE87200093' }];
    isrcLookup = found([recording('Vitamin C', ['mb-can', 'Can'])]);
    declaredDeezerId = found('8213');

    // The page is now its MBID's, at that page's address.
    expect(await resolveArtist('Can')).toEqual({ id: 'a-can', slug: 'page-of-a-can' });
    expect(bound).toEqual([{ artistId: 'a-can', mbid: 'mb-can' }]);
    expect(updates).toEqual([{ deezerId: '8213', mbid: 'mb-can', identifiedBy: 'isrc' }]);
    expect(deletedProfiles).toBe(1);
  });

  it('leaves a row identified by its ISRC alone', async () => {
    artistRows = [
      { id: 'a-27', slug: 'daft-punk', deezerId: '27', mbid: 'mb-dp', identifiedBy: 'isrc' },
    ];
    playRows = [{ title: 'One More Time', isrc: ISRC }];

    await resolveArtist('Daft Punk');

    expect(isrcLookups).toBe(0);
    expect(updates).toEqual([]);
  });

  it("gives another spelling of an identified artist that artist's page", async () => {
    playRows = [{ title: 'Frank Sinatra', isrc: 'FR0W60100020' }];
    isrcLookup = found([recording('Frank Sinatra', ['mb-kittin', 'Miss Kittin'])]);
    declaredDeezerId = found('1234');
    insertConflict = true;
    // No row under this spelling, before or after the insert; one holds the identity.
    artistAnswers = [[], [], [{ id: 'a-kittin', slug: 'kittin' }]];

    expect(await resolveArtist('Miss Kittin')).toEqual({ id: 'a-kittin', slug: 'kittin' });
  });
});

describe('the MBID of a known row, pivot to Musilogy', () => {
  const TALULAH = { id: 'a-tg', slug: 'talulah-gosh', mbid: null, identifiedBy: 'name' } as const;

  it('takes the MBID its played title now finds, and the page of that MBID', async () => {
    artistRows = [{ ...TALULAH }];
    playRows = [{ title: 'Talulah Gosh', isrc: null }];
    titleLookup = found([recording('Talulah Gosh', ['mb-tg', 'Talulah Gosh'])]);
    declaredDeezerId = found('1202408');

    expect(await resolveArtist('Talulah Gosh')).toEqual({ id: 'a-tg', slug: 'page-of-a-tg' });
    expect(updates).toEqual([{ deezerId: '1202408', mbid: 'mb-tg', identifiedBy: 'name' }]);
  });

  it('writes nothing while nothing is found', async () => {
    artistRows = [{ ...TALULAH }];
    playRows = [{ title: 'Talulah Gosh', isrc: null }];

    expect(await resolveArtist('Talulah Gosh')).toEqual({ id: 'a-tg', slug: 'talulah-gosh' });
    expect(updates).toEqual([]);
  });

  it('leaves a known MBID alone', async () => {
    artistRows = [{ ...TALULAH, mbid: 'mb-tg' }];
    playRows = [{ title: 'Talulah Gosh', isrc: null }];

    await resolveArtist('Talulah Gosh');

    expect(titleSearches).toEqual([]);
    expect(updates).toEqual([]);
  });

  it('still resolves the artist when another row already holds the MBID', async () => {
    artistRows = [{ ...TALULAH }];
    playRows = [{ title: 'Talulah Gosh', isrc: null }];
    titleLookup = found([recording('Talulah Gosh', ['mb-tg', 'Talulah Gosh'])]);
    // What drizzle throws for a unique violation: pg's error, code 23505, as cause.
    updateError = new DrizzleQueryError(
      'update "artist" ...',
      [],
      Object.assign(new Error('duplicate key value'), { code: '23505' })
    );

    expect(await resolveArtist('Talulah Gosh')).toEqual({ id: 'a-tg', slug: 'talulah-gosh' });
  });

  it('lets any other write failure surface', async () => {
    artistRows = [{ ...TALULAH }];
    playRows = [{ title: 'Talulah Gosh', isrc: null }];
    titleLookup = found([recording('Talulah Gosh', ['mb-tg', 'Talulah Gosh'])]);
    updateError = new Error('connection terminated');

    const failure = await resolveArtist('Talulah Gosh').then(
      () => null,
      (err: unknown) => err
    );

    expect(failure).toEqual(new Error('connection terminated'));
  });
});

describe('the sources asked', () => {
  // Deezer's terms allow only private use and no « data » generated from the API (§IV):
  // https://developers.deezer.com/termsofuse
  it('identifies an artist through MusicBrainz alone, never Deezer', async () => {
    const { musicbrainzCache, __resetMusicbrainzThrottle } = musicbrainz;
    const asked: string[] = [];
    const json = (body: unknown) =>
      new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
    const fetchSpy = spyOn(globalThis, 'fetch').mockImplementation(((input: string | URL) => {
      const url = String(input);
      asked.push(url);
      // One request a second is the service's own pace: not this test's to wait for.
      __resetMusicbrainzThrottle();
      if (url.includes('/isrc/')) {
        return Promise.resolve(
          json({
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
      return Promise.resolve(json(url.includes('/artist/') ? { relations: [] } : { data: [] }));
    }) as typeof fetch);
    live = true;
    try {
      playRows = [{ title: 'One More Time', isrc: 'GBDUW0000053' }];
      await resolveArtist('Daft Punk');
      playRows = [{ title: 'Unknown Song', isrc: null }];
      await resolveArtist('Unsigned Band');
    } finally {
      fetchSpy.mockRestore();
      musicbrainzCache.dispose();
    }

    expect(asked.length).toBeGreaterThan(0);
    expect(asked.filter((url) => !url.startsWith('https://musicbrainz.org/'))).toEqual([]);
    expect(inserted.map((row) => [row.mbid, row.deezerId])).toEqual([
      ['mb-dp', null],
      [null, null],
    ]);
  });
});

describe('reverifyArtist', () => {
  it('replaces an identity an unchecked ISRC gave, whole, and drops its profile', async () => {
    // Paul McCartney's row held Wings' identity, marked as found by ISRC.
    artistRows = [
      {
        id: 'a-paul',
        slug: 'paul-mccartney',
        deezerId: '2709',
        mbid: 'mb-wings',
        identifiedBy: 'isrc',
      },
    ];
    playRows = [{ title: 'Band on the Run', isrc: 'GBCCS1500158' }];
    isrcLookup = found([recording('Band on the Run', ['mb-wings', 'Wings'])]);
    titleLookup = found([recording('Band on the Run', ['mb-paul', 'Paul McCartney'])]);
    declaredDeezerId = found('1');

    expect(await reverifyArtist('paul mccartney', 'Paul McCartney')).toBe('changed');
    expect(updates).toEqual([{ deezerId: '1', mbid: 'mb-paul', identifiedBy: 'name' }]);
    expect(deletedProfiles).toBe(1);
  });

  it('clears a Deezer artist MusicBrainz does not declare, the identity kept', async () => {
    artistRows = [
      { id: 'a-dp', slug: 'daft-punk', deezerId: '27', mbid: 'mb-dp', identifiedBy: 'isrc' },
    ];
    playRows = [{ title: 'One More Time', isrc: 'GBDUW0000053' }];
    isrcLookup = found([recording('One More Time', ['mb-dp', 'Daft Punk'])]);

    expect(await reverifyArtist('daft punk', 'Daft Punk')).toBe('same');
    expect(updates).toEqual([{ deezerId: null, mbid: 'mb-dp', identifiedBy: 'isrc' }]);
    // The Deezer id is a link, not the identity: the profile stays.
    expect(deletedProfiles).toBe(0);
  });

  it('keeps an identity that checks out', async () => {
    artistRows = [
      { id: 'a-dp', slug: 'daft-punk', deezerId: '27', mbid: 'mb-dp', identifiedBy: 'isrc' },
    ];
    playRows = [{ title: 'One More Time', isrc: 'GBDUW0000053' }];
    isrcLookup = found([recording('One More Time', ['mb-dp', 'Daft Punk'])]);
    declaredDeezerId = found('27');

    expect(await reverifyArtist('daft punk', 'Daft Punk')).toBe('same');
    expect(deletedProfiles).toBe(0);
  });
});
