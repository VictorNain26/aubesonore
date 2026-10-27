import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { createHash } from 'crypto';
import { mkdtemp, readdir, readFile, rm, stat, writeFile, mkdir } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import sharp from 'sharp';
import { coverStoreRoutes } from '../routes/coverStore.routes';
import {
  createCoverStore,
  parseCoverBlocklist,
  parseCoverKey,
  readCoverBlocklist,
  type CoverStore,
} from './coverStore';

const RG = '00b3e683-47fa-3302-add0-4c0cecc5224e';
const ART_ID = '27d87a8584e8ebe4e670e5e7-1791145643';
const CAA_500 = `https://coverartarchive.org/release-group/${RG}/front-500`;
const ARCHIVE = 'https://archive.org/download/mbid-1/mbid-1_thumb500.jpg';
const NODE = 'https://ia800.us.archive.org/1/items/mbid-1/mbid-1_thumb500.jpg';

let jpeg1000: Buffer;
let jpeg100: Buffer;
let root: string;
let seen: string[];
let answers: Map<string, () => Response | Promise<Response>>;
let store: CoverStore;

function fakeFetch(url: string): Promise<Response> {
  seen.push(url);
  const answer = answers.get(url);
  return Promise.resolve(answer ? answer() : new Response(null, { status: 404 }));
}

const image =
  (bytes: Buffer, type = 'image/jpeg') =>
  () =>
    new Response(bytes, { headers: { 'content-type': type } });
const redirect =
  (location: string, status = 307) =>
  () =>
    new Response(null, { status, headers: { location } });

async function sizeOf(path: string): Promise<{ width?: number; height?: number; format?: string }> {
  const { width, height, format } = await sharp(await readFile(path)).metadata();
  return { width, height, format };
}

async function widthOf(cover: unknown): Promise<number | undefined> {
  if (!Buffer.isBuffer(cover)) throw new Error(`no cover: ${String(cover)}`);
  return (await sharp(cover).metadata()).width;
}

beforeAll(async () => {
  const make = (width: number, height: number) =>
    sharp({ create: { width, height, channels: 3, background: '#c86432' } })
      .jpeg()
      .toBuffer();
  jpeg1000 = await make(1000, 800);
  jpeg100 = await make(100, 100);
});

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'cover-store-'));
  seen = [];
  answers = new Map();
  store = createCoverStore({
    root,
    fetch: fakeFetch,
    userAgent: 'AubeSonore/test (https://example.test)',
    azuracastBaseUrl: 'http://azuracast.test',
    stationId: 'aubesonore',
    publicBaseUrl: 'https://aubesonore.fr',
  });
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('parseCoverKey', () => {
  it('reads the three kinds of cover at their own sizes', () => {
    expect(parseCoverKey('caa', RG, '500.webp')).toEqual({ kind: 'caa', id: RG, size: 500 });
    expect(parseCoverKey('station', ART_ID, '96.webp')).toEqual({
      kind: 'station',
      id: ART_ID,
      size: 96,
    });
    const sha = 'a'.repeat(64);
    expect(parseCoverKey('kept', sha, '768.webp')).toEqual({ kind: 'kept', id: sha, size: 768 });
  });

  it.each([
    ['caa', RG, '300.webp'],
    ['caa', RG, '96.webp'],
    ['caa', RG, '500.jpg'],
    ['caa', RG.toUpperCase(), '500.webp'],
    ['caa', '../../etc', '500.webp'],
    ['caa', `${RG}/..`, '500.webp'],
    ['station', ART_ID, '250.webp'],
    ['station', 'abc', '96.webp'],
    ['station', '../x-1', '96.webp'],
    ['kept', 'a'.repeat(63), '96.webp'],
    ['kept', 'g'.repeat(64), '96.webp'],
    ['photo', RG, '500.webp'],
    ['caa', RG, '0500.webp'],
  ])('refuses %s/%s/%s', (kind, id, file) => {
    expect(parseCoverKey(kind, id, file)).toBeNull();
  });
});

describe('a Cover Art Archive cover', () => {
  it("follows the archive's redirects, keeps 500 and 250 as WebP from one fetch, and serves them", async () => {
    answers.set(CAA_500, redirect(ARCHIVE));
    answers.set(ARCHIVE, redirect(NODE, 302));
    answers.set(NODE, image(jpeg1000));

    const small = await store.get({ kind: 'caa', id: RG, size: 250 });

    expect(seen).toEqual([CAA_500, ARCHIVE, NODE]);
    expect(small).toBeInstanceOf(Buffer);
    expect(await sizeOf(join(root, 'covers/caa', RG, '500.webp'))).toEqual({
      width: 500,
      height: 400,
      format: 'webp',
    });
    expect(await sizeOf(join(root, 'covers/caa', RG, '250.webp'))).toEqual({
      width: 250,
      height: 200,
      format: 'webp',
    });

    // Kept: the 500 comes from the file, the archive is not asked again.
    const large = await store.get({ kind: 'caa', id: RG, size: 500 });
    expect(seen).toHaveLength(3);
    expect(large).toEqual(await readFile(join(root, 'covers/caa', RG, '500.webp')));
  });

  it('asks the archive for its 1200 px thumbnail only when the large view is opened', async () => {
    const url = `https://coverartarchive.org/release-group/${RG}/front-1200`;
    answers.set(url, image(jpeg1000));

    await store.get({ kind: 'caa', id: RG, size: 1200 });

    expect(seen).toEqual([url]);
    // Never enlarged: the archive's image is 1000 px wide.
    expect(await sizeOf(join(root, 'covers/caa', RG, '1200.webp'))).toEqual({
      width: 1000,
      height: 800,
      format: 'webp',
    });
    expect(await readdir(join(root, 'covers/caa', RG))).toEqual(['1200.webp']);
  });

  it('never enlarges a small cover', async () => {
    answers.set(CAA_500, image(jpeg100));

    await store.get({ kind: 'caa', id: RG, size: 500 });

    expect(await sizeOf(join(root, 'covers/caa', RG, '500.webp'))).toMatchObject({ width: 100 });
    expect(await sizeOf(join(root, 'covers/caa', RG, '250.webp'))).toMatchObject({ width: 100 });
  });

  it.each([
    'https://evil.example/cover.jpg',
    'http://archive.org/download/x.jpg',
    'https://archive.org.evil.example/x.jpg',
    'https://169.254.169.254/latest/meta-data',
  ])('never follows a redirect off the archive: %s', async (location) => {
    answers.set(CAA_500, redirect(location));

    expect(await store.get({ kind: 'caa', id: RG, size: 500 })).toBe('failed');
    expect(seen.every((url) => url === CAA_500)).toBe(true);
  });

  it('remembers a cover the archive does not have for a day, and keeps nothing', async () => {
    expect(await store.get({ kind: 'caa', id: RG, size: 250 })).toBe('missing');
    expect(await store.get({ kind: 'caa', id: RG, size: 500 })).toBe('missing');

    expect(seen).toEqual([CAA_500]);
    expect(await readdir(root)).toEqual([]);
  });

  it('asks again once when archive.org fails, then gives up without remembering it', async () => {
    answers.set(CAA_500, () => new Response('busy', { status: 503 }));

    expect(await store.get({ kind: 'caa', id: RG, size: 500 })).toBe('failed');
    expect(seen).toEqual([CAA_500, CAA_500]);

    answers.set(CAA_500, image(jpeg1000));
    expect(await store.get({ kind: 'caa', id: RG, size: 500 })).toBeInstanceOf(Buffer);
  });

  it('refuses what is not an image', async () => {
    answers.set(CAA_500, image(Buffer.from('<html>'), 'text/html'));

    expect(await store.get({ kind: 'caa', id: RG, size: 500 })).toBe('failed');
    expect(await readdir(root)).toEqual([]);
  });

  it('fetches once for two listeners asking at the same moment, each given the size it asked for', async () => {
    answers.set(CAA_500, image(jpeg1000));

    const [small, large] = await Promise.all([
      store.get({ kind: 'caa', id: RG, size: 250 }),
      store.get({ kind: 'caa', id: RG, size: 500 }),
    ]);

    expect(seen).toEqual([CAA_500]);
    expect(await widthOf(small)).toBe(250);
    expect(await widthOf(large)).toBe(500);
  });

  it('writes each file whole: no temporary file is left, and a reader never sees half a file', async () => {
    answers.set(CAA_500, image(jpeg1000));

    await store.get({ kind: 'caa', id: RG, size: 500 });

    expect((await readdir(join(root, 'covers/caa', RG))).sort()).toEqual(['250.webp', '500.webp']);
    expect((await stat(join(root, 'covers/caa', RG, '500.webp'))).mode & 0o777).toBe(0o644);
  });
});

describe('fillReleaseGroup', () => {
  it('stores 250 and 500, then knows they are there without asking the archive', async () => {
    answers.set(CAA_500, image(jpeg1000));

    expect(await store.fillReleaseGroup(RG)).toBe('stored');
    expect(await store.fillReleaseGroup(RG)).toBe('present');
    expect(seen).toEqual([CAA_500]);
  });

  it('tells a missing cover apart from one already known missing', async () => {
    expect(await store.fillReleaseGroup(RG)).toBe('missing');
    expect(await store.fillReleaseGroup(RG)).toBe('known-missing');
    expect(seen).toEqual([CAA_500]);
  });
});

describe("the station's covers", () => {
  const ART = `http://azuracast.test/api/station/aubesonore/art/${ART_ID}.jpg`;

  it('makes the four sizes from one fetch of our own AzuraCast', async () => {
    answers.set(ART, image(jpeg1000));

    await store.prepareStation(ART_ID);
    const cover = await store.get({ kind: 'station', id: ART_ID, size: 192 });

    expect(seen).toEqual([ART]);
    expect(cover).toBeInstanceOf(Buffer);
    expect((await readdir(join(root, 'covers/station', ART_ID))).sort()).toEqual([
      '192.webp',
      '384.webp',
      '768.webp',
      '96.webp',
    ]);
  });

  it('gives each size asked at a track change its own size, from one fetch', async () => {
    answers.set(ART, image(jpeg1000));

    const [, light, hero, large] = await Promise.all([
      store.prepareStation(ART_ID),
      store.get({ kind: 'station', id: ART_ID, size: 96 }),
      store.get({ kind: 'station', id: ART_ID, size: 384 }),
      store.get({ kind: 'station', id: ART_ID, size: 768 }),
    ]);

    expect(seen).toEqual([ART]);
    expect(await widthOf(light)).toBe(96);
    expect(await widthOf(hero)).toBe(384);
    expect(await widthOf(large)).toBe(768);
  });

  it("counts AzuraCast's redirect to its generic image as no cover", async () => {
    answers.set(ART, redirect('/static/img/generic_song.jpg', 302));

    expect(await store.get({ kind: 'station', id: ART_ID, size: 96 })).toBe('missing');
    expect(seen).toEqual([ART]);
  });
});

describe('a kept track’s cover', () => {
  it('remakes a size from the kept original', async () => {
    const sha = createHash('sha256').update(jpeg1000).digest('hex');
    await mkdir(join(root, 'originals'), { recursive: true });
    await writeFile(join(root, 'originals', sha), jpeg1000);

    const cover = await store.get({ kind: 'kept', id: sha, size: 384 });

    expect(cover).toBeInstanceOf(Buffer);
    expect(await sizeOf(join(root, 'covers/kept', sha, '384.webp'))).toMatchObject({
      width: 384,
    });
    expect(seen).toEqual([]);
    expect(await store.get({ kind: 'kept', id: 'b'.repeat(64), size: 96 })).toBe('missing');
  });
});

describe('GET /api/cover-store/:kind/:id/:file', () => {
  const ask = (path: string) =>
    coverStoreRoutes(store).handle(new Request(`http://localhost/api/cover-store/${path}`));

  it('serves a cover as an immutable WebP', async () => {
    answers.set(CAA_500, image(jpeg1000));

    const res = await ask(`caa/${RG}/250.webp`);

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/webp');
    expect(res.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect(Buffer.from(await res.arrayBuffer())).toEqual(
      await readFile(join(root, 'covers/caa', RG, '250.webp'))
    );
  });

  it('answers a missing cover with a 404 kept a day, a failure with a 502 kept nowhere', async () => {
    const missing = await ask(`caa/${RG}/500.webp`);
    expect(missing.status).toBe(404);
    expect(missing.headers.get('cache-control')).toBe('public, max-age=86400');

    const other = '11111111-2222-3333-4444-555555555555';
    answers.set(
      `https://coverartarchive.org/release-group/${other}/front-500`,
      () => new Response(null, { status: 500 })
    );
    const failed = await ask(`caa/${other}/500.webp`);
    expect(failed.status).toBe(502);
    expect(failed.headers.get('cache-control')).toBe('no-store');
  });

  it('answers 404 to a malformed address without fetching anything', async () => {
    for (const path of [
      `caa/${RG}/300.webp`,
      'caa/..%2F..%2Fetc/500.webp',
      `photo/${RG}/500.webp`,
    ]) {
      expect((await ask(path)).status).toBe(404);
    }
    expect(seen).toEqual([]);
  });
});

describe('the block list', () => {
  const SHA = 'c'.repeat(64);

  it('reads one cover a line, with who asked and when, between comments and blank lines', () => {
    const text = [
      '# Covers taken down on request.',
      '',
      `caa ${RG}  # removal request from the label, 2026-10-27`,
      `station ${ART_ID} # artist's request 2026-10-28`,
      `kept ${SHA}\t# listener's request 2026-10-29`,
      '',
    ].join('\n');

    expect([...parseCoverBlocklist(text)]).toEqual([
      `caa/${RG}`,
      `station/${ART_ID}`,
      `kept/${SHA}`,
    ]);
  });

  it.each([
    [`caa ${RG}`, 'no comment saying who asked and when'],
    [`caa ${RG} #`, 'an empty comment'],
    [`caa ${RG.toUpperCase()} # request 2026-10-27`, 'an id the store would never name'],
    [`caa ${RG}/500.webp # request 2026-10-27`, 'a file, not a cover'],
    [`station ${RG} # request 2026-10-27`, 'an id of another kind'],
    [`photo ${RG} # request 2026-10-27`, 'an unknown kind'],
    [`caa ${RG} extra # request 2026-10-27`, 'a third word'],
    [`https://coverartarchive.org/release-group/${RG} # request`, 'a URL'],
  ])('refuses %s (%s), naming its line', (line) => {
    expect(() => parseCoverBlocklist(`# header\n${line}\n`)).toThrow(/line 2/);
  });

  it('is valid as committed, so a malformed line fails here rather than at boot', () => {
    expect(() => readCoverBlocklist()).not.toThrow();
  });
});

describe('a blocked cover', () => {
  const ART = `http://azuracast.test/api/station/aubesonore/art/${ART_ID}.jpg`;
  let SHA: string;
  let blocked: CoverStore;

  beforeEach(() => {
    SHA = createHash('sha256').update(jpeg1000).digest('hex');
    blocked = createCoverStore({
      root,
      fetch: fakeFetch,
      userAgent: 'AubeSonore/test (https://example.test)',
      azuracastBaseUrl: 'http://azuracast.test',
      stationId: 'aubesonore',
      publicBaseUrl: 'https://aubesonore.fr',
      blocked: new Set([`caa/${RG}`, `station/${ART_ID}`, `kept/${SHA}`]),
    });
  });

  it('is answered 404 for a day, like a record with no cover, and never fetched again', async () => {
    answers.set(CAA_500, image(jpeg1000));
    // Still on the volume (the boot's removal not run yet): never served by the backend either.
    await mkdir(join(root, 'covers/caa', RG), { recursive: true });
    await writeFile(join(root, 'covers/caa', RG, '500.webp'), jpeg100);

    for (const path of [`caa/${RG}/500.webp`, `caa/${RG}/250.webp`, `station/${ART_ID}/96.webp`]) {
      const res = await coverStoreRoutes(blocked).handle(
        new Request(`http://localhost/api/cover-store/${path}`)
      );
      expect(res.status).toBe(404);
      expect(res.headers.get('cache-control')).toBe('public, max-age=86400');
    }
    expect(seen).toEqual([]);
  });

  it('is skipped by the fill and by the antenna, which ask nothing and write nothing', async () => {
    answers.set(CAA_500, image(jpeg1000));
    answers.set(ART, image(jpeg1000));

    expect(await blocked.fillReleaseGroup(RG)).toBe('blocked');
    await blocked.prepareStation(ART_ID);

    expect(seen).toEqual([]);
    expect(await readdir(root)).toEqual([]);
  });

  it('has its files removed from the volume, and only its own, as many times as it runs', async () => {
    const other = '11111111-2222-3333-4444-555555555555';
    const files = [
      `covers/caa/${RG}/250.webp`,
      `covers/caa/${RG}/500.webp`,
      `covers/station/${ART_ID}/96.webp`,
      `covers/kept/${SHA}/768.webp`,
      `originals/${SHA}`,
      `covers/caa/${other}/500.webp`,
    ];
    for (const file of files) {
      await mkdir(join(root, file, '..'), { recursive: true });
      await writeFile(join(root, file), jpeg100);
    }

    expect(await blocked.removeBlocked()).toBe(3);
    expect(await blocked.removeBlocked()).toBe(0);

    expect(await readdir(join(root, 'covers/caa'))).toEqual([other]);
    expect(await readdir(join(root, 'covers/station'))).toEqual([]);
    expect(await readdir(join(root, 'covers/kept'))).toEqual([]);
    expect(await readdir(join(root, 'originals'))).toEqual([]);
  });
});
