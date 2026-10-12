import { describe, it, expect, mock, spyOn, afterAll, beforeEach } from 'bun:test';
import type { ArtistSearch, DeezerIsrcTrack } from './deezerService';
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
let declaredDeezerId: Lookup<string> = { status: 'none' };
let deezerByIsrc: Lookup<DeezerIsrcTrack> = { status: 'none' };
let deletedProfiles = 0;
let updates: Array<Record<string, unknown>> = [];
let updateError: Error | null = null;
let mbLookup: Lookup<string> = { status: 'none' };
let mbLookups = 0;
let playRows: Array<{ title: string; isrc?: string | null }> = [];
let inserted: Array<Record<string, unknown>> = [];
let search: ArtistSearch = { status: 'none' };
let nowPlaying: NowPlayingTrack | null = null;
let searches = 0;
let searchedTitles: string[] = [];

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
      // Awaited as is (writeIdentity), or with returning (ensureMbid: the row it wrote).
      where: () => {
        const settle = (): Promise<Array<{ id: string }>> => {
          if (updateError) return Promise.reject(updateError);
          updates.push(values);
          return Promise.resolve([{ id: 'written' }]);
        };
        return {
          then: (onDone: (v: unknown) => unknown, onFail: (e: unknown) => unknown) =>
            settle().then(onDone, onFail),
          returning: settle,
        };
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
const deezer = await import('./deezerService');
const onAir = await import('./nowPlaying');
const musicbrainz = await import('./musicbrainzService');
const slugs = await import('./artistSlugs');

// Every MBID of these tests is in the loaded dump, first of its name.
const rankSpy = spyOn(slugs, 'homonymRank').mockResolvedValue(1);

const spies = [
  spyOn(deezer, 'searchArtist').mockImplementation((_name: string, title: string) => {
    searches += 1;
    searchedTitles.push(title);
    return Promise.resolve(search);
  }),
  spyOn(onAir, 'fetchNowPlaying').mockImplementation(() => Promise.resolve(nowPlaying)),
  spyOn(musicbrainz, 'findMbidByDeezerId').mockImplementation(() => {
    mbLookups += 1;
    return Promise.resolve(mbLookup);
  }),
  spyOn(musicbrainz, 'findRecordingsByIsrc').mockImplementation(() => {
    isrcLookups += 1;
    return Promise.resolve(isrcLookup);
  }),
  spyOn(musicbrainz, 'findDeezerIdByMbid').mockImplementation(() =>
    Promise.resolve(declaredDeezerId)
  ),
  spyOn(musicbrainz, 'findRecordingsByTitle').mockImplementation((name, title) => {
    titleSearches.push([name, title]);
    return Promise.resolve(titleLookup);
  }),
  spyOn(deezer, 'findTrackByIsrc').mockImplementation(() => Promise.resolve(deezerByIsrc)),
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

const { primaryArtistName, resolveArtist, reverifyArtist, sameTitle } =
  await import('./artistResolver');
const { normalizeArtistName, slugify } = await import('../lib/artistName');

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
  deezerByIsrc = { status: 'none' };
  deletedProfiles = 0;
  playRows = [];
  inserted = [];
  search = { status: 'none' };
  nowPlaying = null;
  searches = 0;
  searchedTitles = [];
  updates = [];
  updateError = null;
  mbLookup = { status: 'none' };
  mbLookups = 0;
});

describe('primaryArtistName', () => {
  it('strips explicit featuring markers', () => {
    expect(primaryArtistName('Justice feat. Uffie')).toBe('Justice');
    expect(primaryArtistName('Justice ft. Uffie')).toBe('Justice');
    expect(primaryArtistName('Justice featuring Uffie')).toBe('Justice');
    expect(primaryArtistName('Justice FEAT Uffie')).toBe('Justice');
  });

  it('keeps ampersands, plus signs and commas that belong to the name', () => {
    expect(primaryArtistName('Simon & Garfunkel')).toBe('Simon & Garfunkel');
    expect(primaryArtistName('Florence + The Machine')).toBe('Florence + The Machine');
    expect(primaryArtistName('Earth, Wind & Fire')).toBe('Earth, Wind & Fire');
  });

  it('leaves a name containing "feat" as a substring alone', () => {
    expect(primaryArtistName('Defeated Sanity')).toBe('Defeated Sanity');
  });

  it('trims surrounding whitespace', () => {
    expect(primaryArtistName('  Air  ')).toBe('Air');
  });
});

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    expect(slugify('Daft Punk')).toBe('daft-punk');
  });

  it('strips diacritics', () => {
    expect(slugify('Étienne Daho')).toBe('etienne-daho');
  });

  it('collapses punctuation and trims stray hyphens', () => {
    expect(slugify('Simon & Garfunkel!')).toBe('simon-garfunkel');
    expect(slugify('!!!')).toBe('');
  });

  it('keeps letters of every script', () => {
    expect(slugify('Кино')).toBe('кино');
  });
});

describe('normalizeArtistName', () => {
  it('folds case, accents and punctuation', () => {
    expect(normalizeArtistName('Beyoncé')).toBe(normalizeArtistName('BEYONCE'));
    expect(normalizeArtistName('Simon & Garfunkel')).toBe('simon garfunkel');
  });

  it('keys names written without Latin letters', () => {
    expect(normalizeArtistName('坂本龍一')).toBe('坂本龍一');
    expect(normalizeArtistName('Кино')).toBe('кино');
  });
});

describe('resolveArtist', () => {
  it('returns a known artist without asking Deezer', async () => {
    artistRows = [{ id: 'a-1', slug: 'air' }];

    expect(await resolveArtist('Air')).toEqual({ id: 'a-1', slug: 'air' });
    expect(searches).toBe(0);
  });

  it('creates no page for a name the antenna never played', async () => {
    nowPlaying = { sh_id: 1, title: 'X', artist: 'Someone Else', isrc: null };

    expect(await resolveArtist('Buy Cheap Pills')).toBeNull();
    expect(searches).toBe(0);
    expect(inserted).toEqual([]);
  });

  it('accepts the artist on air before the watcher has recorded it', async () => {
    nowPlaying = {
      sh_id: 1,
      title: 'Kelly Watch the Stars',
      artist: 'Air feat. Someone',
      isrc: null,
    };

    expect(await resolveArtist('Air')).not.toBeNull();
    expect(inserted).toHaveLength(1);
    expect(searchedTitles).toEqual(['Kelly Watch the Stars']);
  });

  it('tells homonyms apart by a title the antenna played', async () => {
    playRows = [{ title: 'Cassius 1999' }];

    await resolveArtist('Cassius');

    expect(searchedTitles).toEqual(['Cassius 1999']);
  });

  it('persists nothing while Deezer is failing, so the next call retries', async () => {
    playRows = [{ title: 'Kelly Watch the Stars' }];
    search = { status: 'failed' };

    expect(await resolveArtist('Air')).toBeNull();
    expect(inserted).toEqual([]);
  });

  it('gives an artist Deezer does not know a page of its own', async () => {
    playRows = [{ title: 'Kelly Watch the Stars' }];

    const resolved = await resolveArtist('Unsigned Band feat. Friend');

    expect(resolved?.slug).toBe('unsigned-band');
    expect(inserted[0]).toMatchObject({
      normalizedName: 'unsigned band',
      displayName: 'Unsigned Band',
      deezerId: null,
    });
  });

  it('binds a Deezer match and takes its spelling', async () => {
    playRows = [{ title: 'Kelly Watch the Stars' }];
    search = { status: 'match', artist: { id: '27', name: 'Daft Punk' } };

    await resolveArtist('daft punk');

    expect(inserted[0]).toMatchObject({ displayName: 'Daft Punk', deezerId: '27' });
    expect(claimedSlugs).toEqual([{ slug: 'daft-punk', artistId: inserted[0]?.id as string }]);
  });

  it('gives a homonym the next free suffix, never a slug another artist holds', async () => {
    playRows = [{ title: 'Feeling for You' }];
    takenSlugs = new Set(['cassius', 'cassius-2']);

    expect(await resolveArtist('Cassius')).toMatchObject({ slug: 'cassius-3' });
    expect(claimedSlugs.map((c) => c.slug)).toEqual(['cassius-3']);
  });

  it('keys a name with no letter of its own on the played name', async () => {
    playRows = [{ title: 'Kelly Watch the Stars' }];
    search = { status: 'match', artist: { id: '9', name: '!!!' } };

    expect(await resolveArtist('Chk Chk Chk')).toMatchObject({ slug: 'chk-chk-chk' });
  });

  it('resolves a name written without Latin letters', async () => {
    playRows = [{ title: 'Kelly Watch the Stars' }];

    expect(await resolveArtist('Кино')).toMatchObject({ slug: 'кино' });
  });
});

describe('the MBID, pivot to Musilogy', () => {
  const DAFT_PUNK = {
    status: 'match',
    artist: { id: '27', name: 'Daft Punk' },
  } as const;

  it('takes the MBID MusicBrainz declares for the Deezer artist found by name', async () => {
    playRows = [{ title: 'Da Funk' }];
    search = DAFT_PUNK;
    mbLookup = { status: 'found', value: 'mb-daft-punk' };

    await resolveArtist('Daft Punk');

    expect(inserted[0]).toMatchObject({
      deezerId: '27',
      mbid: 'mb-daft-punk',
      identifiedBy: 'name',
    });
  });

  it('asks MusicBrainz nothing for an artist Deezer does not know', async () => {
    playRows = [{ title: 'Demo' }];

    await resolveArtist('Unsigned Band');

    expect(mbLookups).toBe(0);
    expect(inserted[0]).toMatchObject({ deezerId: null, mbid: null });
  });

  it('persists nothing while MusicBrainz fails, so a later play retries', async () => {
    playRows = [{ title: 'Da Funk' }];
    search = DAFT_PUNK;
    mbLookup = { status: 'failed' };

    expect(await resolveArtist('Daft Punk')).toBeNull();
    expect(inserted).toEqual([]);
  });

  it('completes a known artist still missing its MBID, without asking Deezer again', async () => {
    artistRows = [{ id: 'a-27', slug: 'daft-punk', deezerId: '27', mbid: null }];
    mbLookup = { status: 'found', value: 'mb-daft-punk' };

    await resolveArtist('Daft Punk');

    expect(searches).toBe(0);
    expect(updates).toEqual([{ mbid: 'mb-daft-punk' }]);
  });

  it('leaves a known MBID alone', async () => {
    artistRows = [{ id: 'a-27', slug: 'daft-punk', deezerId: '27', mbid: 'mb-daft-punk' }];

    await resolveArtist('Daft Punk');

    expect(mbLookups).toBe(0);
  });

  it('still resolves the artist when another row already holds the MBID', async () => {
    artistRows = [{ id: 'a-27', slug: 'daft-punk', deezerId: '27', mbid: null }];
    mbLookup = { status: 'found', value: 'mb-daft-punk' };
    // What drizzle throws for a unique violation: pg's error, code 23505, as cause.
    updateError = new DrizzleQueryError(
      'update "artist" ...',
      [],
      Object.assign(new Error('duplicate key value'), { code: '23505' })
    );

    expect(await resolveArtist('Daft Punk')).toEqual({ id: 'a-27', slug: 'daft-punk' });
  });

  it('lets any other write failure surface', async () => {
    artistRows = [{ id: 'a-27', slug: 'daft-punk', deezerId: '27', mbid: null }];
    mbLookup = { status: 'found', value: 'mb-daft-punk' };
    updateError = new Error('connection terminated');

    const failure = await resolveArtist('Daft Punk').then(
      () => null,
      (err: unknown) => err
    );

    expect(failure).toEqual(new Error('connection terminated'));
  });
});

describe('sameTitle', () => {
  it('matches a title and its versions, never another song', () => {
    expect(sameTitle('Un mec en or', 'Un Mec En Or')).toBe(true);
    expect(sameTitle('Come Together', 'Come Together (Remastered 2009)')).toBe(true);
    expect(sameTitle('Illusion Of Time', 'Dissolution')).toBe(false);
    expect(sameTitle('Un mec en or', 'Lirik Banzay')).toBe(false);
    // The Drums, measured 2026-10-04: an apostrophe typed on one side only.
    expect(sameTitle('Lets Go Surfing', 'Let’s Go Surfing')).toBe(true);
  });
});

describe('identity by ISRC', () => {
  const ISRC = 'GBDUW0000053';
  const page = (deezerId: string | null): Lookup<string> =>
    deezerId ? { status: 'found', value: deezerId } : { status: 'none' };
  const recording = (title: string, ...credits: Array<[string, string]>): IsrcRecording => ({
    title,
    credits: credits.map(([mbid, name]) => ({ mbid, names: [name] })),
  });
  const deezerTrack = (title: string, ...artists: Array<[string, string]>) =>
    ({
      status: 'found',
      value: {
        title,
        artists: artists.map(([id, name]) => ({ id, name })),
        link: null,
        cover: null,
      },
    }) as const;

  it('identifies a new artist by an ISRC whose recording is the played track', async () => {
    playRows = [{ title: 'One More Time', isrc: ISRC }];
    isrcLookup = { status: 'found', value: [recording('One More Time', ['mb-dp', 'Daft Punk'])] };
    declaredDeezerId = page('27');

    await resolveArtist('Daft Punk');

    expect(searches).toBe(0);
    expect(inserted[0]).toMatchObject({
      displayName: 'Daft Punk',
      deezerId: '27',
      mbid: 'mb-dp',
      identifiedBy: 'isrc',
    });
  });

  it('finds the MBID through a recording of the played title credited to the name, as a last resort', async () => {
    playRows = [{ title: 'Talulah Gosh', isrc: null }];
    titleLookup = {
      status: 'found',
      value: [
        recording('Talulah Gosh', ['mb-tg', 'Talulah Gosh']),
        // Another song, and the same title under another artist: neither counts.
        recording('Steaming Train', ['mb-other', 'Talulah Gosh']),
        recording('Talulah Gosh', ['mb-cover', 'Someone Else']),
      ],
    };

    await resolveArtist('Talulah Gosh');

    expect(titleSearches).toEqual([['Talulah Gosh', 'Talulah Gosh']]);
    expect(inserted[0]).toMatchObject({ mbid: 'mb-tg', identifiedBy: 'name' });
  });

  it('takes no MBID from a title two artists of that name recorded', async () => {
    playRows = [{ title: 'How Did This Happen?!', isrc: null }];
    titleLookup = {
      status: 'found',
      value: [
        recording('How Did This Happen?!', ['mb-1', 'BODEGA']),
        recording('How Did This Happen?!', ['mb-2', 'Bodega']),
      ],
    };

    await resolveArtist('BODEGA');

    expect(inserted[0]).toMatchObject({ mbid: null });
  });

  it('takes no MBID from a longer title, nor from an artist declaring another Deezer page', async () => {
    playRows = [{ title: 'Home', isrc: null }];
    titleLookup = { status: 'found', value: [recording('Home Again', ['mb-home', 'Home Band'])] };
    await resolveArtist('Home Band');
    expect(inserted[0]).toMatchObject({ mbid: null });

    inserted = [];
    playRows = [{ title: 'Testcard Girl', isrc: null }];
    search = { status: 'match', artist: { id: '27', name: 'Talulah Gosh' } };
    titleLookup = {
      status: 'found',
      value: [recording('Testcard Girl', ['mb-tg', 'Talulah Gosh'])],
    };
    declaredDeezerId = { status: 'found', value: '99' };
    await resolveArtist('Talulah Gosh');
    expect(inserted[0]).toMatchObject({ deezerId: '27', mbid: null });
  });

  it('searches a title without its version, and not at all once a Deezer link answered', async () => {
    playRows = [{ title: 'Testcard Girl (2011 Remaster)', isrc: null }];
    await resolveArtist('Talulah Gosh');
    expect(titleSearches).toEqual([['Talulah Gosh', 'Testcard Girl']]);

    titleSearches = [];
    search = { status: 'match', artist: { id: '27', name: 'Daft Punk' } };
    mbLookup = { status: 'found', value: 'mb-daft-punk' };
    await resolveArtist('Daft Punk');
    expect(titleSearches).toEqual([]);
  });

  it('completes an ISRC that gave only a Deezer artist, unless the one found declares another', async () => {
    playRows = [{ title: 'Talulah Gosh', isrc: ISRC }];
    // The ISRC's Deezer track credits the played name: a checked Deezer artist, no MBID.
    deezerByIsrc = deezerTrack('Talulah Gosh', ['1202408', 'Talulah Gosh']);
    titleLookup = {
      status: 'found',
      value: [recording('Talulah Gosh', ['mb-tg', 'Talulah Gosh'])],
    };
    await resolveArtist('Talulah Gosh');
    expect(inserted[0]).toMatchObject({ deezerId: '1202408', mbid: 'mb-tg', identifiedBy: 'isrc' });

    inserted = [];
    declaredDeezerId = { status: 'found', value: '99' };
    await resolveArtist('Talulah Gosh');
    expect(inserted[0]).toMatchObject({ deezerId: '1202408', mbid: null });
  });

  it('writes nothing when the search fails, to try again at the next play', async () => {
    playRows = [{ title: 'Talulah Gosh', isrc: null }];
    titleLookup = { status: 'failed' };

    expect(await resolveArtist('Talulah Gosh')).toBeNull();
    expect(inserted).toEqual([]);
  });

  it('names a new played artist by its MBID page, the slug that page already has', async () => {
    playRows = [{ title: 'One More Time', isrc: ISRC }];
    isrcLookup = { status: 'found', value: [recording('One More Time', ['mb-dp', 'Daft Punk'])] };
    declaredDeezerId = page('27');
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
    isrcLookup = { status: 'found', value: [recording('One More Time', ['mb-dp', 'Daft Punk'])] };
    declaredDeezerId = page('27');
    rankSpy.mockResolvedValueOnce(undefined);

    expect(await resolveArtist('Daft Punk')).toMatchObject({ slug: 'daft-punk' });
    expect(claimedSlugs).toEqual([{ slug: 'daft-punk', artistId: inserted[0]?.id as string }]);
  });

  it("gives a new played artist's MBID page a slug when it has none yet, and the row none", async () => {
    playRows = [{ title: 'One More Time', isrc: ISRC }];
    isrcLookup = { status: 'found', value: [recording('One More Time', ['mb-dp', 'Daft Punk'])] };
    declaredDeezerId = page('27');

    expect(await resolveArtist('Daft Punk')).toMatchObject({ slug: 'daft-punk' });
    expect(claimedSlugs).toEqual([{ slug: 'daft-punk', mbid: 'mb-dp' }]);
  });

  it('takes the credited artist bearing the played name, not the first credited', async () => {
    playRows = [{ title: 'Something', isrc: ISRC }];
    isrcLookup = {
      status: 'found',
      value: [recording('Something', ['mb-a', 'Another Artist'], ['mb-b', 'Played Name'])],
    };
    declaredDeezerId = page('99');

    await resolveArtist('Played Name');

    expect(inserted[0]).toMatchObject({ mbid: 'mb-b', identifiedBy: 'isrc' });
  });

  // Measured in production on 2026-10-04: Paul McCartney's track, whose ISRC
  // MusicBrainz credits to Wings, had made his page Wings'.
  it('does not take another artist credited on the ISRC', async () => {
    playRows = [{ title: 'Band on the Run', isrc: 'GBCCS1500158' }];
    isrcLookup = { status: 'found', value: [recording('Band on the Run', ['mb-wings', 'Wings'])] };
    deezerByIsrc = deezerTrack('Band On The Run', ['2709', 'Wings']);
    search = { status: 'match', artist: { id: '1', name: 'Paul McCartney' } };
    mbLookup = { status: 'found', value: 'mb-paul' };

    await resolveArtist('Paul McCartney');

    expect(inserted[0]).toMatchObject({ deezerId: '1', mbid: 'mb-paul', identifiedBy: 'name' });
  });

  // Daniel Avery's « Illusion Of Time » had its ISRC filed on ANNA's « Dissolution ».
  it('does not take a recording of another title', async () => {
    playRows = [{ title: 'Illusion Of Time', isrc: 'GBTZZ2000002' }];
    isrcLookup = {
      status: 'found',
      value: [recording('Dissolution', ['mb-anna', 'Daniel Avery'])],
    };

    await resolveArtist('Daniel Avery');

    expect(inserted[0]).toMatchObject({ mbid: null, identifiedBy: 'name' });
  });

  // Deezer answered « Lirik Banzay » by Sweelk Mc for The Pirouettes' « Un mec en or ».
  it('does not take a Deezer track of another title', async () => {
    playRows = [{ title: 'Un mec en or', isrc: 'FR9W11309005' }];
    deezerByIsrc = deezerTrack('Lirik Banzay', ['4438509', 'Sweelk Mc']);

    await resolveArtist('The Pirouettes');

    expect(inserted[0]).toMatchObject({ deezerId: null, identifiedBy: 'name' });
  });

  it('asks Deezer for the ISRC when MusicBrainz declares no single Deezer artist', async () => {
    playRows = [{ title: 'One More Time', isrc: ISRC }];
    isrcLookup = { status: 'found', value: [recording('One More Time', ['mb-dp', 'Daft Punk'])] };
    declaredDeezerId = page(null);
    deezerByIsrc = deezerTrack('One More Time', ['27', 'Daft Punk']);

    await resolveArtist('Daft Punk');

    expect(inserted[0]).toMatchObject({ deezerId: '27', mbid: 'mb-dp' });
  });

  it('reaches the MBID through the Deezer link when MusicBrainz does not know the ISRC', async () => {
    playRows = [{ title: 'One More Time', isrc: ISRC }];
    deezerByIsrc = deezerTrack('One More Time', ['27', 'Daft Punk']);
    mbLookup = { status: 'found', value: 'mb-daft-punk' };

    await resolveArtist('Daft Punk');

    expect(inserted[0]).toMatchObject({
      deezerId: '27',
      mbid: 'mb-daft-punk',
      identifiedBy: 'isrc',
    });
  });

  it('persists nothing while a source fails on the ISRC, so the next play retries', async () => {
    playRows = [{ title: 'One More Time', isrc: ISRC }];
    isrcLookup = { status: 'failed' };

    expect(await resolveArtist('Daft Punk')).toBeNull();
    expect(inserted).toEqual([]);
    expect(searches).toBe(0);
  });

  it('re-identifies a row bound by its name once a checked ISRC tells better, and drops its profile', async () => {
    // Can was bound by name to a one-album homonym on Deezer (measured 2026-10-03).
    artistRows = [
      { id: 'a-can', slug: 'can', deezerId: '366546802', mbid: null, identifiedBy: 'name' },
    ];
    playRows = [{ title: 'Vitamin C', isrc: 'DEAE87200093' }];
    isrcLookup = { status: 'found', value: [recording('Vitamin C', ['mb-can', 'Can'])] };
    declaredDeezerId = page('8213');

    // The page is now its MBID's, at that page's address.
    expect(await resolveArtist('Can')).toEqual({ id: 'a-can', slug: 'page-of-a-can' });
    expect(bound).toEqual([{ artistId: 'a-can', mbid: 'mb-can' }]);
    expect(updates).toEqual([{ deezerId: '8213', mbid: 'mb-can', identifiedBy: 'isrc' }]);
    expect(deletedProfiles).toBe(1);
  });

  it('gives a row its own page again when a checked ISRC finds it has no MBID', async () => {
    // Its slug was its old MBID page's (migration 0021): that page is another artist's now.
    artistRows = [
      { id: 'a-can', slug: 'can', deezerId: '366546802', mbid: 'mb-homonym', identifiedBy: 'name' },
    ];
    playRows = [{ title: 'Vitamin C', isrc: 'DEAE87200093' }];
    deezerByIsrc = deezerTrack('Vitamin C', ['8213', 'Can']);
    takenSlugs = new Set(['can']);

    expect(await resolveArtist('Can')).toEqual({ id: 'a-can', slug: 'can-2' });
    expect(updates).toEqual([{ deezerId: '8213', mbid: null, identifiedBy: 'isrc' }]);
    expect(claimedSlugs).toEqual([{ slug: 'can-2', artistId: 'a-can' }]);
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
    isrcLookup = {
      status: 'found',
      value: [recording('Frank Sinatra', ['mb-kittin', 'Miss Kittin'])],
    };
    declaredDeezerId = page('1234');
    insertConflict = true;
    // No row under this spelling, before or after the insert; one holds the identity.
    artistAnswers = [[], [], [{ id: 'a-kittin', slug: 'kittin' }]];

    expect(await resolveArtist('Miss Kittin')).toEqual({ id: 'a-kittin', slug: 'kittin' });
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
    isrcLookup = {
      status: 'found',
      value: [{ title: 'Band on the Run', credits: [{ mbid: 'mb-wings', names: ['Wings'] }] }],
    };
    search = { status: 'match', artist: { id: '1', name: 'Paul McCartney' } };
    mbLookup = { status: 'found', value: 'mb-paul' };

    expect(await reverifyArtist('paul mccartney', 'Paul McCartney')).toBe('changed');
    expect(updates).toEqual([{ deezerId: '1', mbid: 'mb-paul', identifiedBy: 'name' }]);
    expect(deletedProfiles).toBe(1);
  });

  it('keeps an identity that checks out', async () => {
    artistRows = [
      { id: 'a-dp', slug: 'daft-punk', deezerId: '27', mbid: 'mb-dp', identifiedBy: 'isrc' },
    ];
    playRows = [{ title: 'One More Time', isrc: 'GBDUW0000053' }];
    isrcLookup = {
      status: 'found',
      value: [{ title: 'One More Time', credits: [{ mbid: 'mb-dp', names: ['Daft Punk'] }] }],
    };
    declaredDeezerId = { status: 'found', value: '27' };

    expect(await reverifyArtist('daft punk', 'Daft Punk')).toBe('kept');
    expect(deletedProfiles).toBe(0);
  });
});
