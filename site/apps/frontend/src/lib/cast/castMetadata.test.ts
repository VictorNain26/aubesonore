import { describe, expect, it } from 'vitest';
import type { NowPlaying } from '@aubesonore/shared-types/azuracast';
import { castTrack } from './castMetadata';

const LOGO = 'https://aubesonore.fr/icon-512.png';

function onAir(song: Partial<NowPlaying['now_playing']['song']>): NowPlaying {
  return {
    now_playing: {
      song: {
        id: '1',
        art: 'https://radio.aubesonore.fr/api/station/1/art/abc-1.jpg',
        text: '',
        artist: 'The Auteurs',
        title: 'Idiot Brother',
        album: 'New Wave',
        genre: '',
        isrc: '',
        lyrics: '',
        ...song,
      },
    },
  } as NowPlaying;
}

describe('castTrack', () => {
  it('shows the track on air with its cover', () => {
    expect(castTrack(onAir({}), LOGO)).toEqual({
      title: 'Idiot Brother',
      artist: 'The Auteurs',
      album: 'New Wave',
      image: 'https://radio.aubesonore.fr/api/station/1/art/abc-1.jpg',
    });
  });

  it("puts the station's logo in place of AzuraCast's generic art, and drops an empty album", () => {
    const track = castTrack(
      onAir({ art: 'https://radio.aubesonore.fr/static/img/generic_song.jpg', album: ' ' }),
      LOGO
    );
    expect(track.image).toBe(LOGO);
    expect(track.album).toBeNull();
  });

  it('names the station until the first answer', () => {
    expect(castTrack(null, LOGO)).toEqual({
      title: 'AubeSonore',
      artist: '',
      album: null,
      image: LOGO,
    });
  });
});
