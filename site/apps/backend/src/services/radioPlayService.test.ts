import { afterAll, describe, it, expect, spyOn } from 'bun:test';
import * as nowPlaying from './nowPlaying';
import { buildPlayRow, groupTitles, playOnAir } from './radioPlayService';

// spyOn, not mock.module: a mocked module leaks into the other test files (Bun 1.3).
const onAir = spyOn(nowPlaying, 'fetchNowPlaying');
afterAll(() => onAir.mockRestore());

describe('playOnAir', () => {
  it('finds a track kept in the minute before the watcher records it, with its ISRC', async () => {
    onAir.mockResolvedValueOnce({
      sh_id: 1,
      title: 'F Major',
      artist: 'Hania Rani feat. Dobrawa Czocher',
      isrc: 'DEN271800071',
    });

    expect(await playOnAir('F major', 'Hania Rani')).toEqual({
      title: 'F Major',
      isrc: 'DEN271800071',
    });
  });

  it('is no play for another track on air, or with AzuraCast down', async () => {
    onAir.mockResolvedValueOnce({ sh_id: 2, title: 'Other', artist: 'Hania Rani', isrc: null });
    expect(await playOnAir('F Major', 'Hania Rani')).toBeNull();

    onAir.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    expect(await playOnAir('F Major', 'Hania Rani')).toBeNull();
  });
});

describe('buildPlayRow', () => {
  it('normalises the artist for indexed lookup', () => {
    const row = buildPlayRow(1, 'Nosedive', 'Étienne Daho', null);

    expect(row.artist).toBe('Étienne Daho');
    expect(row.artistNormalized).toBe('etienne daho');
  });

  it('normalises a featuring credit to its primary artist', () => {
    expect(buildPlayRow(2, 'D.A.N.C.E.', 'Justice feat. Uffie', null).artistNormalized).toBe(
      'justice'
    );
  });

  it('keys artists written in any script', () => {
    expect(buildPlayRow(7, 'Группа крови', 'Кино', null).artistNormalized).toBe('кино');
    expect(buildPlayRow(8, 'Merry Christmas Mr. Lawrence', '坂本龍一', null).artistNormalized).toBe(
      '坂本龍一'
    );
  });

  it('carries the AzuraCast song-history id', () => {
    expect(buildPlayRow(42, 'A', 'X', null).shId).toBe(42);
  });

  it('keeps the raw title and artist untouched for display', () => {
    const row = buildPlayRow(3, '  Around the World  ', 'Daft Punk', null);

    expect(row.title).toBe('  Around the World  ');
    expect(row.artist).toBe('Daft Punk');
  });

  it('generates a distinct id per play', () => {
    expect(buildPlayRow(4, 'A', 'X', null).id).not.toBe(buildPlayRow(5, 'A', 'X', null).id);
  });

  it('keeps the ISRC AzuraCast reported, or null', () => {
    expect(buildPlayRow(9, 'A', 'X', 'GBAYE6500165').isrc).toBe('GBAYE6500165');
    expect(buildPlayRow(10, 'A', 'X', null).isrc).toBeNull();
  });

  it('yields an empty normalised name for a blank artist', () => {
    expect(buildPlayRow(6, 'A', '   ', null).artistNormalized).toBe('');
  });
});

describe('groupTitles', () => {
  const play = (title: string, hoursAgo: number, isrc: string | null = null) => ({
    title,
    artist: 'Supergrass',
    isrc,
    playedAt: new Date(Date.UTC(2026, 9, 4, 16) - hoursAgo * 3_600_000),
  });

  it('folds the plays of one title into a row, the latest title first', () => {
    const rows = groupTitles(
      [
        play('The Word', 0),
        play('The Bird is on Fire', 21, 'GBAAA0000002'),
        play('The word', 29),
        play('The Bird Is On Fire', 33),
      ],
      20
    );

    expect(rows.map((row) => [row.title, row.plays])).toEqual([
      ['The Word', 2],
      ['The Bird is on Fire', 2],
    ]);
    expect(rows[0]?.lastPlayedAt).toEqual(new Date(Date.UTC(2026, 9, 4, 16)));
  });

  it('keeps the latest ISRC a title was played with, and at most `limit` titles', () => {
    const rows = groupTitles(
      [play('A', 0), play('A', 1, 'GBAAA0000001'), play('B', 2), play('C', 3)],
      2
    );

    expect(rows.map((row) => row.title)).toEqual(['A', 'B']);
    expect(rows[0]?.isrc).toBe('GBAAA0000001');
  });
});
