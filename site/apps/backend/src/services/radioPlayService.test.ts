import { afterAll, describe, it, expect, spyOn } from 'bun:test';
import * as nowPlaying from './nowPlaying';
import { playOnAir } from './radioPlayService';

const onAir = spyOn(nowPlaying, 'fetchNowPlaying');
afterAll(() => onAir.mockRestore());

describe('playOnAir', () => {
  it('finds a track kept in the minute before the watcher records it, with its ISRC', async () => {
    onAir.mockResolvedValueOnce({
      sh_id: 1,
      title: 'F Major',
      artist: 'Hania Rani feat. Dobrawa Czocher',
      isrc: 'DEN271800071',
      artId: null,
    });

    expect(await playOnAir('F major', 'Hania Rani')).toEqual({
      title: 'F Major',
      isrc: 'DEN271800071',
    });
  });

  it('is no play for another track on air, or with AzuraCast down', async () => {
    onAir.mockResolvedValueOnce({
      sh_id: 2,
      title: 'Other',
      artist: 'Hania Rani',
      isrc: null,
      artId: null,
    });
    expect(await playOnAir('F Major', 'Hania Rani')).toBeNull();

    onAir.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    expect(await playOnAir('F Major', 'Hania Rani')).toBeNull();
  });
});
