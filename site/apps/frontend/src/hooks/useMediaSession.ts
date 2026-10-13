import { useEffect } from 'react';
import { usePlayer } from '../lib/player';

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
        artwork: data.artworkUrl
          ? [
              { src: data.artworkUrl, sizes: '96x96', type: 'image/jpeg' },
              { src: data.artworkUrl, sizes: '192x192', type: 'image/jpeg' },
              { src: data.artworkUrl, sizes: '512x512', type: 'image/jpeg' },
            ]
          : [],
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
