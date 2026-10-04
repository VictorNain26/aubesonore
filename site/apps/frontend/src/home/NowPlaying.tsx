import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useShallow } from 'zustand/react/shallow';
import { Share2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { KeepHeart } from './KeepHeart';
import { useNowPlayingStore } from '../lib/azuracast';
import { usePlayer } from '../lib/player';
import { useTrackActions } from '../hooks/player/useTrackActions';
import { useArtistPage } from '../hooks/useArtistPage';
import { artistPath } from '../lib/artistProfile';
import { Cover } from './Cover';
import { VolumeControl, type VolumeControlProps } from './VolumeControl';
import { ARTIST_LINK, TEXT_ACTION } from './styles';
import {
  ListenDisc,
  ListenLabel,
  listenAria,
  listenState,
  useHeroListenVisible,
  type ListenState,
} from './listen';
import * as m from '@/paraglide/messages.js';

// Past this length the title would take three lines at hero size.
const LONG_TITLE = 28;

// A single's album is its own title: saying it twice tells nothing.
function shownAlbum(album: string, title: string): string | null {
  const name = album.trim();
  return name && name.localeCompare(title.trim(), undefined, { sensitivity: 'accent' }) !== 0
    ? name
    : null;
}

export interface NowPlayingViewProps {
  track: {
    title: string;
    artist: string;
    /** As the antenna names it; not shown when empty or when it repeats the title. */
    album: string;
    art: string | undefined;
  } | null;
  isOnline: boolean;
  listen: ListenState;
  onToggleListen: () => void;
  /** Ref on the Écouter button, watched to hide the player bar while it is visible. */
  listenRef?: React.Ref<HTMLButtonElement>;
  isKept: boolean;
  isKeeping: boolean;
  onToggleKeep: () => void;
  onShare: () => void;
  /** The artist's page, once it exists: no link rather than a dead one. */
  artistHref: string | null;
  /** True once the live has moved past the track shown at load: changes then animate. */
  hasChanged?: boolean;
  /** Shown beside Écouter while listening, so the level is set without scrolling to the bar. */
  volume?: Omit<VolumeControlProps, 'tone' | 'className'>;
}

/**
 * What plays now, the biggest thing on the page: the cover, the title, the
 * artist (a link to their page once it exists), its album, and Écouter right
 * under it, beside Garder and Partager. What played before is the thread just
 * below.
 */
export function NowPlayingView({
  track,
  isOnline,
  listen,
  onToggleListen,
  listenRef,
  isKept,
  isKeeping,
  onToggleKeep,
  onShare,
  artistHref,
  hasChanged = false,
  volume,
}: NowPlayingViewProps) {
  const trackKey = track ? `${track.artist}|${track.title}` : 'none';
  const album = track ? shownAlbum(track.album, track.title) : null;
  return (
    <div className="grid w-full gap-6 md:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] md:items-end md:gap-x-16">
      <div className="lift-in">
        {track ? (
          <Cover
            key={trackKey}
            src={track.art}
            alt={m.now_cover_alt({ title: track.title, artist: track.artist })}
            seed={`${track.artist}|${track.title}`}
            priority
            className={cn('artwork-size shadow-cover aspect-square', hasChanged && 'swap-in')}
          />
        ) : (
          <div
            aria-hidden="true"
            className="artwork-size bg-surface-raised aspect-square rounded-sm"
          />
        )}
      </div>

      <div className="lift-in-late flex min-w-0 flex-col gap-2">
        {!isOnline ? (
          <p className="text-intro text-text-muted m-0" aria-live="polite">
            {m.off_air()}
          </p>
        ) : track ? (
          <div key={trackKey} className={cn('flex flex-col gap-2', hasChanged && 'swap-in-late')}>
            <h2
              className={cn(
                'm-0 text-balance',
                track.title.length > LONG_TITLE ? 'text-section' : 'text-hero'
              )}
            >
              {track.title}
            </h2>
            <p className="text-headline text-text-muted m-0 font-normal">
              {/* Inline padding grows the tap target to 44px without moving the line. */}
              {artistHref ? (
                <Link to={artistHref} className={cn(ARTIST_LINK, 'py-3 underline-offset-6')}>
                  {track.artist}
                </Link>
              ) : (
                track.artist
              )}
            </p>
            {album ? (
              <p className="text-sub text-text-muted m-0">
                {m.now_album_from()} <cite>{album}</cite>
              </p>
            ) : null}
          </div>
        ) : (
          <div aria-busy="true" className="flex flex-col gap-2">
            <span className="bg-surface-raised h-16 w-3/4 rounded-sm" />
            <span className="bg-surface-raised h-7 w-1/3 rounded-sm" />
          </div>
        )}

        <div className="mt-6 flex flex-col gap-3 md:mt-8 md:flex-row md:items-center md:gap-6">
          <button
            ref={listenRef}
            type="button"
            onClick={onToggleListen}
            aria-label={listenAria(listen)}
            aria-busy={listen === 'connecting'}
            className="group bg-accent text-on-accent ease-spring focus-visible:outline-accent flex h-14 w-full items-center gap-3 rounded-full py-1.5 pr-6 pl-1.5 transition-transform duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-95 md:w-auto"
          >
            <ListenDisc state={listen} className="size-11" />
            <ListenLabel state={listen} className="text-ui font-semibold" />
          </button>
          {track && isOnline ? (
            <span className="flex flex-wrap gap-x-5">
              <button
                type="button"
                onClick={onToggleKeep}
                disabled={isKeeping}
                aria-pressed={isKept}
                className={TEXT_ACTION}
              >
                <KeepHeart isKept={isKept} className="size-4" />
                {m.track_keep()}
              </button>
              <button type="button" onClick={onShare} className={TEXT_ACTION}>
                <Share2 className="size-4" strokeWidth={1.6} aria-hidden="true" />
                {m.track_share()}
              </button>
            </span>
          ) : null}
          {volume && listen !== 'idle' ? <VolumeControl {...volume} tone="surface" /> : null}
        </div>
      </div>
    </div>
  );
}

export function NowPlaying() {
  const { title, artist, album, art, isOnline } = useNowPlayingStore(
    useShallow((s) => ({
      title: s.data?.now_playing?.song.title,
      artist: s.data?.now_playing?.song.artist,
      album: s.data?.now_playing?.song.album,
      art: s.data?.now_playing?.song.art,
      isOnline: s.data?.is_online ?? true,
    }))
  );
  const { isPlaying, isConnecting, toggle, volume, isMuted, setVolume, toggleMute } = usePlayer(
    useShallow((s) => ({
      isPlaying: s.isPlaying,
      isConnecting: s.isConnecting,
      toggle: s.toggle,
      volume: s.volume,
      isMuted: s.isMuted,
      setVolume: s.setVolume,
      toggleMute: s.toggleMute,
    }))
  );
  const { isLiked, isLiking, handleToggleLike, handleShare } = useTrackActions();
  const artistPage = useArtistPage(artist);
  const setListenVisible = useHeroListenVisible((s) => s.setVisible);
  const listenRef = useRef<HTMLButtonElement>(null);
  const trackKey = title && artist ? `${artist}|${title}` : null;
  const [firstTrackKey, setFirstTrackKey] = useState<string | null>(null);
  if (firstTrackKey === null && trackKey !== null) setFirstTrackKey(trackKey);

  useEffect(() => {
    const button = listenRef.current;
    if (!button) return;
    // The bar slides in once this button has left the screen; the top margin
    // keeps it from flickering at the edge.
    const observer = new IntersectionObserver(
      ([entry]) => setListenVisible(entry?.isIntersecting ?? true),
      { rootMargin: '-80px 0px 0px 0px' }
    );
    observer.observe(button);
    return () => observer.disconnect();
  }, [setListenVisible]);

  return (
    <NowPlayingView
      track={title && artist ? { title, artist, album: album ?? '', art } : null}
      isOnline={isOnline}
      listen={listenState(isPlaying, isConnecting)}
      onToggleListen={toggle}
      listenRef={listenRef}
      isKept={isLiked}
      isKeeping={isLiking}
      onToggleKeep={handleToggleLike}
      onShare={handleShare}
      artistHref={artistPage ? artistPath(artistPage) : null}
      hasChanged={firstTrackKey !== null && trackKey !== firstTrackKey}
      volume={{ volume, isMuted, onVolumeChange: setVolume, onToggleMute: toggleMute }}
    />
  );
}
