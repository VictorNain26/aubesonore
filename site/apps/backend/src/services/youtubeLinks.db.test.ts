import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from 'bun:test';
import { sql } from 'drizzle-orm';
import { db, pool, schema } from '../db';
import { assertTestDatabase } from '../test/pg';
import { refreshStoredLinks, resolveSong, songKey, youtubeUrls } from './youtubeLinks';
import * as youtube from './youtubeService';

// YouTube API data is refreshed or deleted within 30 days (Developer Policies III.E.4.d): the
// limits these tests hold are the policy's, not a tuning.
const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
const daysAgo = (days: number, minutes = 0) =>
  new Date(Date.now() - days * DAY_MS - minutes * MINUTE_MS);

async function store(title: string, artist: string, videoId: string | null, checkedAt: Date) {
  await db
    .insert(schema.youtubeLink)
    .values({ songKey: songKey(title, artist), videoId, checkedAt });
}

async function stored() {
  const rows = await db
    .select({ videoId: schema.youtubeLink.videoId, checkedAt: schema.youtubeLink.checkedAt })
    .from(schema.youtubeLink);
  return new Map(rows.map((row) => [row.videoId, row.checkedAt]));
}

beforeAll(async () => {
  await assertTestDatabase();
});

beforeEach(async () => {
  await db.execute(sql`TRUNCATE youtube_link`);
});

afterEach(() => {
  mock.restore();
});

afterAll(async () => {
  await pool.end();
});

describe('youtubeUrls', () => {
  it('serves a link checked within 30 days, never an older one', async () => {
    await store('Fresh', 'A', 'fresh', daysAgo(30, -1));
    await store('Stale', 'A', 'stale', daysAgo(30, 1));

    const urls = await youtubeUrls([
      { title: 'Fresh', artist: 'A' },
      { title: 'Stale', artist: 'A' },
    ]);

    expect([...urls.entries()]).toEqual([[songKey('Fresh', 'A'), youtube.videoUrl('fresh')]]);
  });

  it('serves nothing for a song whose last search found no Art Track', async () => {
    await store('None', 'A', null, daysAgo(1));
    expect((await youtubeUrls([{ title: 'None', artist: 'A' }])).size).toBe(0);
  });
});

describe('resolveSong', () => {
  const answer = (lookup: Awaited<ReturnType<typeof youtube.findArtTrack>>) =>
    spyOn(youtube, 'findArtTrack').mockResolvedValue(lookup);

  it('stores the Art Track it verified, which the kept track then links to', async () => {
    answer({ status: 'found', value: 'vid' });

    await resolveSong('F Major', 'Hania Rani');

    expect([...(await youtubeUrls([{ title: 'F Major', artist: 'Hania Rani' }])).values()]).toEqual(
      [youtube.videoUrl('vid')]
    );
  });

  it('stores nothing when YouTube cannot answer, so the song is searched again', async () => {
    answer({ status: 'failed' });

    await resolveSong('F Major', 'Hania Rani');

    expect((await stored()).size).toBe(0);
  });

  it.each([
    ['a stored video', 'vid', 40, false],
    ['a search that found nothing within 30 days', null, 29, false],
    ['a search that found nothing 30 days ago', null, 31, true],
  ])('after %s, searches again: %p', async (_, videoId, days, again) => {
    await store('F Major', 'Hania Rani', videoId, daysAgo(days));
    const search = answer({ status: 'none' });

    await resolveSong('F Major', 'Hania Rani');

    expect(search.mock.calls.length > 0).toBe(again);
  });
});

describe('refreshStoredLinks', () => {
  it('asks again only for links older than 25 days', async () => {
    const existing = spyOn(youtube, 'existingVideos').mockImplementation((ids) =>
      Promise.resolve(new Set(ids))
    );
    const recentAt = daysAgo(25, -1);
    await store('Recent', 'A', 'recent', recentAt);
    await store('Due', 'A', 'due', daysAgo(25, 1));

    await refreshStoredLinks();

    expect(existing.mock.calls).toEqual([[['due']]]);
    const after = await stored();
    expect(after.get('due')!.getTime()).toBeGreaterThan(daysAgo(1).getTime());
    expect(after.get('recent')!.getTime()).toBe(recentAt.getTime());
  });

  it('forgets a video YouTube no longer has, so the song is searched anew', async () => {
    spyOn(youtube, 'existingVideos').mockResolvedValue(new Set(['kept']));
    await store('Kept', 'A', 'kept', daysAgo(26));
    await store('Gone', 'A', 'gone', daysAgo(26));

    await refreshStoredLinks();

    expect([...(await stored()).keys()]).toEqual(['kept']);
  });

  it('leaves a song whose last search found nothing to be searched again', async () => {
    const existing = spyOn(youtube, 'existingVideos');
    const checkedAt = daysAgo(26);
    await store('None', 'A', null, checkedAt);

    await refreshStoredLinks();

    expect(existing).not.toHaveBeenCalled();
    expect((await stored()).get(null)!.getTime()).toBe(checkedAt.getTime());
  });

  it('changes nothing when YouTube cannot answer', async () => {
    spyOn(youtube, 'existingVideos').mockResolvedValue(null);
    const checkedAt = daysAgo(26);
    await store('Due', 'A', 'due', checkedAt);

    await refreshStoredLinks();

    expect((await stored()).get('due')!.getTime()).toBe(checkedAt.getTime());
  });
});
