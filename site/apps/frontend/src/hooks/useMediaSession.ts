import { useEffect } from 'react';
import { usePlayer } from '../lib/player';
import { artworkAt, artworkSrcSet } from '../lib/artwork';

const MEDIA_SIZES = [96, 192, 384, 768] as const;

/**
 * The cover the lock screen picks from: the station's at each size the cover store keeps, as WebP;
 * a cover no host resizes, once, as it is.
 */
export function mediaArtwork(url: string): MediaImage[] {
  if (!artworkSrcSet(url)) return [{ src: url }];
  return MEDIA_SIZES.map((size) => {
    const src = artworkAt(url, size);
    return {
      src,
      sizes: `${size}x${size}`,
      type: src.endsWith('.webp') ? 'image/webp' : 'image/jpeg',
    };
  });
}

// Wires the Media Session API so the OS can display the current track in
// lock-screen / hardware-key controls (Android, macOS Now Playing, Chrome
// media hub). Without this, an installed PWA shows generic "Tab playing"
// with no metadata. For a live radio there is no seek/skip — only play/
// pause/stop handlers are wired.
//
// `play`/`stop` are read from the store inside the handler closures (not
// subscribed) so the effect doesn't re-run on each isPlaying flip.

interface MediaSessionData {
  title: string | undefined;
  artist: string | undefined;
  album: string | undefined | null;
  artworkUrl: string | undefined;
}

export function useMediaSession(data: MediaSessionData, isPlaying: boolean): void {
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;

    if (data.title && data.artist) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: data.title,
        artist: data.artist,
        album: data.album ?? '',
        artwork: data.artworkUrl ? mediaArtwork(data.artworkUrl) : [],
      });
    } else {
      navigator.mediaSession.metadata = null;
    }

    const onPlay = () => {
      void usePlayer.getState().play();
    };
    const onStop = () => {
      usePlayer.getState().stop();
    };

    navigator.mediaSession.setActionHandler('play', onPlay);
    navigator.mediaSession.setActionHandler('pause', onStop);
    navigator.mediaSession.setActionHandler('stop', onStop);

    return () => {
      navigator.mediaSession.setActionHandler('play', null);
      navigator.mediaSession.setActionHandler('pause', null);
      navigator.mediaSession.setActionHandler('stop', null);
    };
  }, [data.title, data.artist, data.album, data.artworkUrl]);

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
  }, [isPlaying]);
}
