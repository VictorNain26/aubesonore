import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useAuthStore } from '../stores/authStore';
import { useLikedTracksStore } from '../stores/likedTracksStore';
import { LikedTracksModalView } from '../design/organisms/LikedTracksModalView';

interface LikedTracksModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Rows shown before « Afficher les N autres », and after each reopening. */
  pageSize?: number;
}

// Grace period during which a removed track stays visible with an Undo
// affordance before the unlike request actually fires.
const REMOVAL_DELAY_MS = 5000;

export function LikedTracksModal({ isOpen, onClose, pageSize = 50 }: LikedTracksModalProps) {
  const user = useAuthStore((s) => s.user);
  const tracks = useLikedTracksStore((s) => s.tracks);
  const isLoading = useLikedTracksStore((s) => s.isLoading);
  const unlikeTrack = useLikedTracksStore((s) => s.unlikeTrack);
  const refresh = useLikedTracksStore((s) => s.refresh);
  const [visibleCount, setVisibleCount] = useState(pageSize);
  const [wasOpen, setWasOpen] = useState(isOpen);
  // id → timestamp at which the pending removal becomes effective.
  const [pendingRemovals, setPendingRemovals] = useState<Map<string, number>>(new Map());
  const removalTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  // Ticks the countdown bars shown on pending-removal rows. Only runs while
  // at least one removal is pending.
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (pendingRemovals.size === 0) return;
    const interval = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(interval);
  }, [pendingRemovals.size]);

  // Reset pagination on open via the React "adjust state on prop change"
  // pattern rather than an effect.
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) setVisibleCount(pageSize);
  }

  // Refetch on open: a track kept on another device lands here.
  useEffect(() => {
    if (isOpen) void refresh();
  }, [isOpen, refresh]);

  // On close, finalize any pending removals (closing confirms the intent) and
  // clear their timers so nothing fires against an unmounted component.
  useEffect(() => {
    const timers = removalTimers.current;
    return () => {
      timers.forEach((timer, id) => {
        clearTimeout(timer);
        void unlikeTrack(id);
      });
      timers.clear();
    };
  }, [unlikeTrack]);

  const handleDelete = useCallback(
    (id: string) => {
      setPendingRemovals((prev) => new Map(prev).set(id, Date.now() + REMOVAL_DELAY_MS));
      const timer = setTimeout(() => {
        removalTimers.current.delete(id);
        setPendingRemovals((prev) => {
          const next = new Map(prev);
          next.delete(id);
          return next;
        });
        void unlikeTrack(id);
      }, REMOVAL_DELAY_MS);
      removalTimers.current.set(id, timer);
    },
    [unlikeTrack]
  );

  const handleUndo = useCallback((id: string) => {
    const timer = removalTimers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      removalTimers.current.delete(id);
    }
    setPendingRemovals((prev) => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const sortedTracks = useMemo(
    () =>
      [...tracks].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [tracks]
  );

  const visibleTracks = sortedTracks.slice(0, visibleCount);
  const hiddenCount = sortedTracks.length - visibleTracks.length;

  const trackViewModels = visibleTracks.map((track) => {
    const removalEndsAt = pendingRemovals.get(track.id);
    return {
      id: track.id,
      title: track.title,
      artist: track.artist,
      keptAt: track.createdAt,
      ...(track.artworkUrl ? { artworkUrl: track.artworkUrl } : {}),
      listenHref: track.youtubeUrl,
      pendingRemoval: removalEndsAt !== undefined,
      ...(removalEndsAt !== undefined
        ? { removalFraction: Math.max(0, Math.min(1, (removalEndsAt - now) / REMOVAL_DELAY_MS)) }
        : {}),
    };
  });

  if (!user) return null;

  return (
    <LikedTracksModalView
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      totalCount={tracks.length}
      isLoading={isLoading && tracks.length === 0}
      tracks={trackViewModels}
      hiddenCount={hiddenCount}
      onShowMore={() => setVisibleCount(sortedTracks.length)}
      onDeleteTrack={handleDelete}
      onUndoTrack={handleUndo}
    />
  );
}
