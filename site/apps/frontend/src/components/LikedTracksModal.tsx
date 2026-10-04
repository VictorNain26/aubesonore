import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { PLATFORM_NAMES, PLATFORMS } from '@aubesonore/shared-types/client';
import type { PreferredPlatform } from '../lib/api';
import { getPlatformLink } from '@aubesonore/core/share';
import { toast } from 'sonner';
import { toastError } from '../lib/appToast';
import { disableAlert, enableAlert, getAlertState, type AlertState } from '../lib/push';
import { useAuthStore } from '../stores/authStore';
import { useLikedTracksStore } from '../stores/likedTracksStore';
import { usePreferencesStore } from '../stores/preferencesStore';
import { LikedTracksModalView } from '../design/organisms/LikedTracksModalView';
import * as m from '@/paraglide/messages.js';

interface LikedTracksModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Rows shown before « Afficher les N autres », and after each reopening. */
  pageSize?: number;
}

// getPlatformLink files a YouTube choice under its YouTube Music link.
const linkKey = (platform: PreferredPlatform) =>
  platform === 'youtube' ? 'youtubeMusic' : platform;

// Grace period during which a removed track stays visible with an Undo
// affordance before the unlike request actually fires.
const REMOVAL_DELAY_MS = 5000;

function useAlert() {
  const [state, setState] = useState<AlertState | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    void getAlertState().then(setState);
  }, []);

  const onToggle = () => {
    setIsBusy(true);
    (state === 'on' ? disableAlert() : enableAlert())
      .then(setState)
      .catch(() => toast(m.alert_failed()))
      .finally(() => setIsBusy(false));
  };

  return { state, isBusy, onToggle };
}

export function LikedTracksModal({ isOpen, onClose, pageSize = 50 }: LikedTracksModalProps) {
  const user = useAuthStore((s) => s.user);
  const alert = useAlert();
  const tracks = useLikedTracksStore((s) => s.tracks);
  const isLoading = useLikedTracksStore((s) => s.isLoading);
  const unlikeTrack = useLikedTracksStore((s) => s.unlikeTrack);
  const refresh = useLikedTracksStore((s) => s.refresh);
  const preferences = usePreferencesStore((s) => s.preferences);
  const updatePlatform = usePreferencesStore((s) => s.updatePlatform);
  const [visibleCount, setVisibleCount] = useState(pageSize);
  const [wasOpen, setWasOpen] = useState(isOpen);
  // id → timestamp at which the pending removal becomes effective.
  const [pendingRemovals, setPendingRemovals] = useState<Map<string, number>>(new Map());
  const removalTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  // Ticks the countdown bars shown on pending-removal rows. Only runs while
  // at least one removal is pending.
  const [now, setNow] = useState(() => Date.now());

  // Only the platforms a kept track really opens on, and Deezer always: every
  // track on the antenna comes from its Deezer page, whose ISRC finds it there.
  // A saved choice that opens nothing (Spotify without Premium, Tidal…) reads
  // as Deezer instead of promising a platform the links never reach.
  const platforms = useMemo(
    () =>
      PLATFORMS.filter(
        (platform) =>
          platform.id === 'deezer' ||
          tracks.some((track) => track.platformLinks?.[linkKey(platform.id)])
      ),
    [tracks]
  );
  const saved = preferences?.preferredPlatform;
  const preferredPlatform: PreferredPlatform =
    saved && platforms.some((platform) => platform.id === saved) ? saved : 'deezer';

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

  // Refetch on open: links resolved server-side after the like (background
  // enrichment) land here, so the "open" action points at a real track link
  // instead of the unresolved state.
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

  const handleUpdatePlatform = useCallback(
    (platform: PreferredPlatform) => {
      void updatePlatform(platform).then((saved) => {
        if (!saved) toastError(m.library_platform_error());
      });
    },
    [updatePlatform]
  );

  const sortedTracks = useMemo(
    () =>
      [...tracks].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [tracks]
  );

  const visibleTracks = sortedTracks.slice(0, visibleCount);
  const hiddenCount = sortedTracks.length - visibleTracks.length;

  const preferredKey = linkKey(preferredPlatform);
  const linkOf = (track: (typeof visibleTracks)[number]) => {
    const link = getPlatformLink(track, preferredPlatform);
    return link
      ? {
          href: link.href,
          platform: PLATFORM_NAMES[link.platform],
          isPreferred: link.platform === preferredKey,
        }
      : null;
  };

  const trackViewModels = visibleTracks.map((track) => {
    const removalEndsAt = pendingRemovals.get(track.id);
    return {
      id: track.id,
      title: track.title,
      artist: track.artist,
      keptAt: track.createdAt,
      ...(track.artworkUrl ? { artworkUrl: track.artworkUrl } : {}),
      link: linkOf(track),
      pendingRemoval: removalEndsAt !== undefined,
      ...(removalEndsAt !== undefined
        ? { removalFraction: Math.max(0, Math.min(1, (removalEndsAt - now) / REMOVAL_DELAY_MS)) }
        : {}),
    };
  });

  if (!user) return null;

  return (
    <LikedTracksModalView
      alert={alert}
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      totalCount={tracks.length}
      isLoading={isLoading && tracks.length === 0}
      tracks={trackViewModels}
      hiddenCount={hiddenCount}
      onShowMore={() => setVisibleCount(sortedTracks.length)}
      platforms={platforms}
      selectedPlatformId={preferredPlatform}
      onSelectPlatform={(platformId) => handleUpdatePlatform(platformId as PreferredPlatform)}
      onDeleteTrack={handleDelete}
      onUndoTrack={handleUndo}
    />
  );
}
