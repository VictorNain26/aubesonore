import { useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useNowPlayingStore } from '../lib/azuracast';
import { useLikedTracksStore, isTrackLiked, trackKey } from '../stores/likedTracksStore';
import { useLikeAction } from './useLikeAction';
import { shareTrackWithToast, getRadioShareUrl } from '../lib/shareTrack';

interface UseTrackActions {
  title: string | undefined;
  artist: string | undefined;
  isLiked: boolean;
  isLiking: boolean;
  handleToggleLike: () => void;
  handleShare: () => void;
}

/**
 * Garder and Partager for a track: the one a view shows when it gives it (the bar keeps the last
 * track on screen while the next one's cover loads), else the one on air.
 */
export function useTrackActions(shown?: {
  title: string | undefined;
  artist: string | undefined;
}): UseTrackActions {
  const onAir = useNowPlayingStore(
    useShallow((s) => ({
      title: s.data?.now_playing?.song.title,
      artist: s.data?.now_playing?.song.artist,
    }))
  );
  const { title, artist } = shown ?? onAir;
  const tracks = useLikedTracksStore((s) => s.tracks);
  const { likingTrackId, toggleLike } = useLikeAction();

  const isLiked = title && artist ? isTrackLiked(tracks, title, artist) : false;
  const isLiking = title && artist ? likingTrackId === trackKey(title, artist) : false;

  const handleToggleLike = useCallback(() => {
    if (title && artist) {
      void toggleLike(title, artist);
    }
  }, [title, artist, toggleLike]);

  const handleShare = useCallback(() => {
    if (!title || !artist) return;
    void shareTrackWithToast({ title, artist, url: getRadioShareUrl(title, artist) });
  }, [title, artist]);

  return { title, artist, isLiked, isLiking, handleToggleLike, handleShare };
}
