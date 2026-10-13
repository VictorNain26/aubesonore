import { useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { toast } from 'sonner';
import { useNowPlayingStore } from '../../lib/azuracast';
import { usePlayer } from '../../lib/player';
import { useMediaSession } from '../../hooks/player/useMediaSession';
import * as m from '@/paraglide/messages.js';

// Invisible component that hosts the player's side effects driven by outside state (the track on
// air changing, the audio playing), mounted once in App whatever the page.

export function PlayerSideEffects(): null {
  const { title, artist, album, art } = useNowPlayingStore(
    useShallow((s) => ({
      title: s.data?.now_playing?.song.title,
      artist: s.data?.now_playing?.song.artist,
      album: s.data?.now_playing?.song.album,
      art: s.data?.now_playing?.song.art,
    }))
  );
  const isPlaying = usePlayer((s) => s.isPlaying);
  const playError = usePlayer((s) => s.playError);
  const clearPlayError = usePlayer((s) => s.clearPlayError);
  const play = usePlayer((s) => s.play);

  useMediaSession({ title, artist, album, artworkUrl: art }, isPlaying);

  // While listening, the tab shows what plays (useful from another tab).
  useEffect(() => {
    if (!isPlaying || !title || !artist) return;
    const previous = document.title;
    document.title = `${title}, ${artist} · AubeSonore`;
    return () => {
      document.title = previous;
    };
  }, [isPlaying, title, artist]);

  useEffect(() => {
    if (playError) {
      toast(m.toast_sound_cut(), {
        duration: 8000,
        action: { label: m.toast_sound_retry(), onClick: () => void play() },
      });
      clearPlayError();
    }
  }, [playError, clearPlayError, play]);

  return null;
}
