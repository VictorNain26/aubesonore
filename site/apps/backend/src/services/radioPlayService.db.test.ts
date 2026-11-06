import { afterAll, beforeAll, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { db, pool } from '../db';
import { radioPlay } from '../db/schema';
import { assertTestDatabase } from '../test/pg';
import * as nowPlaying from './nowPlaying';
import { findPlay, recordPlay } from './radioPlayService';

// radio_play is what the antenna played, the floor no other source knows (docs/vision.md §4.5).
const onAir = spyOn(nowPlaying, 'fetchNowPlaying').mockResolvedValue(null);

const plays = () =>
  db
    .select({ shId: radioPlay.shId, artistNormalized: radioPlay.artistNormalized })
    .from(radioPlay)
    .orderBy(radioPlay.shId);

beforeAll(async () => {
  await assertTestDatabase();
});

beforeEach(async () => {
  await db.execute(sql`TRUNCATE radio_play`);
  onAir.mockClear();
  onAir.mockResolvedValue(null);
});

afterAll(async () => {
  onAir.mockRestore();
  await pool.end();
});

describe('recordPlay', () => {
  it('records a play once, however often a restart sees it again', async () => {
    await recordPlay(42, 'Nosedive', 'Étienne Daho', null);
    await recordPlay(42, 'Nosedive', 'Étienne Daho', null);
    await recordPlay(43, 'Nosedive', 'Étienne Daho', null);

    expect(await plays()).toEqual([
      { shId: 42, artistNormalized: 'etienne daho' },
      { shId: 43, artistNormalized: 'etienne daho' },
    ]);
  });

  it("keeps the title as played, AzuraCast's ISRC, and the primary artist as key", async () => {
    await recordPlay(45, '  D.A.N.C.E.  ', 'Justice feat. Uffie', 'FR0NT0700420');

    expect(
      await db
        .select({
          title: radioPlay.title,
          artist: radioPlay.artist,
          artistNormalized: radioPlay.artistNormalized,
          isrc: radioPlay.isrc,
        })
        .from(radioPlay)
    ).toEqual([
      {
        title: '  D.A.N.C.E.  ',
        artist: 'Justice feat. Uffie',
        artistNormalized: 'justice',
        isrc: 'FR0NT0700420',
      },
    ]);
  });

  it('records nothing for a play without an artist', async () => {
    await recordPlay(44, 'Jingle', '   ', null);

    expect(await plays()).toEqual([]);
  });
});

describe('findPlay', () => {
  async function played(title: string, artist: string, isrc: string | null, at: Date) {
    await db.insert(radioPlay).values({
      id: randomUUID(),
      shId: Math.floor(Math.random() * 1e9),
      title,
      artist,
      artistNormalized: artist.toLowerCase(),
      isrc,
      playedAt: at,
    });
  }

  it('finds the latest play of the title by the artist, compared once normalised', async () => {
    await played('F Major', 'hania rani', 'OLD000000001', new Date('2026-10-01T00:00:00Z'));
    await played('F Major', 'hania rani', 'NEW000000001', new Date('2026-10-02T00:00:00Z'));
    await played('Other', 'hania rani', 'OTH000000001', new Date('2026-10-03T00:00:00Z'));

    expect(await findPlay('f major', 'Hania Rani feat. Dobrawa Czocher')).toEqual({
      title: 'F Major',
      isrc: 'NEW000000001',
    });
    expect(onAir).not.toHaveBeenCalled();
  });

  it('turns to the track on air when the watcher has not recorded it yet, and finds no other', async () => {
    onAir.mockResolvedValue({
      sh_id: 1,
      title: 'F Major',
      artist: 'Hania Rani',
      isrc: 'DEN271800071',
      artId: null,
    });

    expect(await findPlay('F Major', 'Hania Rani')).toEqual({
      title: 'F Major',
      isrc: 'DEN271800071',
    });
    expect(await findPlay('Another Song', 'Hania Rani')).toBeNull();
  });
});
