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

export function useTrackActions(): UseTrackActions {
  const { title, artist } = useNowPlayingStore(
    useShallow((s) => ({
      title: s.data?.now_playing?.song.title,
      artist: s.data?.now_playing?.song.artist,
    }))
  );
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
