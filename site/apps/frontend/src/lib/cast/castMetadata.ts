import { isDefaultArtwork } from '@aubesonore/core/azuracast';
import type { NowPlaying } from '@aubesonore/shared-types/azuracast';

export interface CastTrack {
  title: string;
  artist: string;
  album: string | null;
  image: string;
}

/**
 * What a TV shows of the track on air: the station's name and logo until the first now-playing
 * answer, AzuraCast's generic art replaced by the logo, as the site does with its wave.
 */
export function castTrack(nowPlaying: NowPlaying | null, logoUrl: string): CastTrack {
  const song = nowPlaying?.now_playing.song;
  if (!song?.title) return { title: 'AubeSonore', artist: '', album: null, image: logoUrl };
  return {
    title: song.title,
    artist: song.artist,
    album: song.album.trim() || null,
    image: isDefaultArtwork(song.art) ? logoUrl : song.art,
  };
}
