import { afterAll, beforeAll, describe, expect, it, spyOn } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { db, pool } from '../db';
import { artist, artistProfile, artistSlug, radioPlay } from '../db/schema';
import { assertTestDatabase, emptyArtistTables, installMusilogyRanks, setRanks } from '../test/pg';
import { __resetMusicbrainzThrottle, musicbrainzCache } from './musicbrainzService';
import { slugOfArtistPage } from './artistSlugs';
import { reidentifyArtists } from './artistResolver';

// The one-off pass after the Deezer API left identity (docs/vision.md §2.5): every known artist
// identified again by MusicBrainz alone, against the real database. MusicBrainz is the real
// service behind a mocked fetch, its throttle included.
const A = '00000000-0000-4000-8000-00000000000a';
const B_OLD = '00000000-0000-4000-8000-0000000000b0';
const B_NEW = '00000000-0000-4000-8000-0000000000b1';
const C_OLD = '00000000-0000-4000-8000-0000000000c0';
const D_NEW = '00000000-0000-4000-8000-0000000000d1';

const credited = (title: string, mbid: string, name: string) => ({
  recordings: [{ title, 'artist-credit': [{ name, artist: { id: mbid, name } }] }],
});
const ANSWERS: Record<string, unknown> = {
  '/isrc/FRAAA0000001': credited('Song A', A, 'Ay'),
  [`/artist/${A}`]: {
    relations: [{ type: 'free streaming', url: { resource: 'https://www.deezer.com/artist/111' } }],
  },
  '/isrc/FRBBB0000001': credited('Song B', B_NEW, 'Bee'),
  '/isrc/FRDDD0000001': credited('Song D', D_NEW, 'Dee'),
  '/recording/': { recordings: [] },
};

const requests: Array<{ path: string; at: number }> = [];
let inFlight = 0;
let mostInFlight = 0;
const fetchSpy = spyOn(globalThis, 'fetch').mockImplementation((async (input: string | URL) => {
  const url = new URL(String(input));
  if (url.hostname !== 'musicbrainz.org') throw new Error(`unexpected request to ${url.hostname}`);
  const path = url.pathname.replace(/^\/ws\/2/, '');
  requests.push({ path, at: performance.now() });
  inFlight += 1;
  mostInFlight = Math.max(mostInFlight, inFlight);
  await Bun.sleep(5);
  inFlight -= 1;
  const body = ANSWERS[path];
  return body === undefined
    ? new Response('{}', { status: 404 })
    : Response.json(body, { status: 200 });
}) as unknown as typeof fetch);

async function play(artistName: string, title: string, isrc: string | null, shId: number) {
  await db.insert(radioPlay).values({
    id: randomUUID(),
    shId,
    title,
    artist: artistName,
    artistNormalized: artistName.toLowerCase(),
    isrc,
  });
}

/** The rows the pass may write, in a stable order, to compare two runs. */
async function snapshot() {
  const rows = await db.select().from(artist).orderBy(artist.id);
  const slugs = await db.select().from(artistSlug).orderBy(artistSlug.slug);
  const profiles = await db.select().from(artistProfile).orderBy(artistProfile.artistId);
  return { rows, slugs, profiles };
}

const row = async (id: string) =>
  (
    await db
      .select()
      .from(artist)
      .where(sql`${artist.id} = ${id}`)
  )[0];

function forget(): void {
  musicbrainzCache.clear();
  __resetMusicbrainzThrottle();
  requests.length = 0;
  mostInFlight = 0;
}

let first: Awaited<ReturnType<typeof reidentifyArtists>>;

beforeAll(async () => {
  await assertTestDatabase();
  await installMusilogyRanks();
  await emptyArtistTables();
  await db.execute(sql`TRUNCATE radio_play`);
  // Every MBID is in the loaded dump; the played name's plain slug is the older MBID's.
  await setRanks({ [A]: 1, [B_OLD]: 1, [B_NEW]: 2, [C_OLD]: 1, [D_NEW]: 1 });

  const at = new Date('2026-10-01T00:00:00Z');
  await db.insert(artist).values([
    // Its MBID found again; its Deezer id was the API's.
    { id: 'a', normalizedName: 'ay', displayName: 'Ay', mbid: A, deezerId: '999' },
    // An MBID the Deezer API led to, which MusicBrainz alone gives as another.
    { id: 'b', normalizedName: 'bee', displayName: 'Bee', mbid: B_OLD, deezerId: '222' },
    // An MBID MusicBrainz alone does not give, its page at a slug of its own.
    { id: 'c', normalizedName: 'cee', displayName: 'Cee', mbid: C_OLD, deezerId: '333' },
    // Without an MBID until now.
    { id: 'd', normalizedName: 'dee', displayName: 'Dee' },
    // Known, never played nor kept.
    { id: 'e', normalizedName: 'eh', displayName: 'Eh', mbid: null },
  ]);
  await db.insert(artistSlug).values([
    { slug: 'ay', mbid: A },
    { slug: 'bee', mbid: B_OLD },
    { slug: 'cee', artistId: 'c' },
    { slug: 'dee', artistId: 'd' },
    { slug: 'eh', artistId: 'e' },
  ]);
  await db
    .insert(artistProfile)
    .values(['a', 'b', 'c'].map((artistId) => ({ artistId, refreshedAt: at })));
  await play('Ay', 'Song A', 'FRAAA0000001', 1);
  await play('Bee', 'Song B', 'FRBBB0000001', 2);
  await play('Cee', 'Song C', null, 3);
  await play('Dee', 'Song D', 'FRDDD0000001', 4);

  forget();
  first = await reidentifyArtists();
}, 30_000);

afterAll(async () => {
  fetchSpy.mockRestore();
  await pool.end();
});

describe('every known artist identified again by MusicBrainz alone', () => {
  it('counts each outcome', () => {
    expect(first).toEqual({
      same: 1,
      changed: 1,
      cleared: 1,
      gained: 1,
      none: 0,
      held: 0,
      unplayed: 1,
      failed: 0,
    });
  });

  it('leaves an artist whose MBID is found again as it was, but for the Deezer link', async () => {
    expect(await row('a')).toMatchObject({ mbid: A, deezerId: '111', identifiedBy: 'isrc' });
    expect(await slugOfArtistPage('a')).toBe('ay');
    expect(
      await db
        .select()
        .from(artistProfile)
        .where(sql`artist_id = 'a'`)
    ).toHaveLength(1);
  });

  it('moves a changed artist to its MBID’s page, the old slug kept by the old MBID’s', async () => {
    expect(await row('b')).toMatchObject({ mbid: B_NEW, deezerId: null });
    expect(await slugOfArtistPage('b')).toBe('bee-2');
    expect(
      await db
        .select()
        .from(artistSlug)
        .where(sql`slug = 'bee'`)
    ).toEqual([{ slug: 'bee', artistId: null, mbid: B_OLD }]);
    // Its portrait and facts were another artist's.
    expect(
      await db
        .select()
        .from(artistProfile)
        .where(sql`artist_id = 'b'`)
    ).toHaveLength(0);
  });

  it('clears an MBID MusicBrainz alone does not give, the row and its slug kept', async () => {
    expect(await row('c')).toMatchObject({ mbid: null, deezerId: null, identifiedBy: 'name' });
    expect(await slugOfArtistPage('c')).toBe('cee');
  });

  it('gives an MBID to an artist that had none, its slug becoming its MBID page’s', async () => {
    expect(await row('d')).toMatchObject({ mbid: D_NEW, identifiedBy: 'isrc' });
    expect(await slugOfArtistPage('d')).toBe('dee');
  });

  it('never deletes a slug', async () => {
    const slugs = (await db.select().from(artistSlug)).map((s) => s.slug).sort();
    expect(slugs).toEqual(['ay', 'bee', 'bee-2', 'cee', 'dee', 'eh']);
  });

  it('asks MusicBrainz one request at a time, a second apart at least', () => {
    expect(requests.length).toBeGreaterThan(1);
    expect(mostInFlight).toBe(1);
    const gaps = requests.slice(1).map((r, i) => r.at - (requests[i]?.at ?? 0));
    // The throttle's timer may fire a millisecond early.
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(995);
  });

  it('changes nothing when run again', async () => {
    const before = await snapshot();
    forget();
    expect(await reidentifyArtists()).toEqual({
      same: 3,
      changed: 0,
      cleared: 0,
      gained: 0,
      none: 1,
      held: 0,
      unplayed: 1,
      failed: 0,
    });
    expect(await snapshot()).toEqual(before);
  }, 30_000);
});
