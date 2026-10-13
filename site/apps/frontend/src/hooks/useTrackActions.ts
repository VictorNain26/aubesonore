import { useCallback } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useNowPlayingStore } from '../lib/azuracast';
import { useLikedTracksStore, isTrackLiked } from '../stores/likedTracksStore';
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
  const { artUrl, title, artist } = useNowPlayingStore(
    useShallow((s) => ({
      artUrl: s.data?.now_playing?.song.art,
      title: s.data?.now_playing?.song.title,
      artist: s.data?.now_playing?.song.artist,
    }))
  );
  const tracks = useLikedTracksStore((s) => s.tracks);
  const { likingTrackId, toggleLike } = useLikeAction();

  const isLiked = title && artist ? isTrackLiked(tracks, title, artist) : false;
  const isLiking = likingTrackId === `${title}-${artist}`;

  const handleToggleLike = useCallback(() => {
    if (title && artist) {
      void toggleLike(title, artist, artUrl);
    }
  }, [title, artist, artUrl, toggleLike]);

  const handleShare = useCallback(() => {
    if (!title || !artist) return;
    void shareTrackWithToast({ title, artist, url: getRadioShareUrl(title, artist) });
  }, [title, artist]);

  return { title, artist, isLiked, isLiking, handleToggleLike, handleShare };
}
