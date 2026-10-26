import { useState, type Ref } from 'react';
import type { FallbackProps } from 'react-error-boundary';
import { Link } from 'react-router';
import { useShallow } from 'zustand/react/shallow';
import { cn } from '@/lib/utils';
import { KeepHeart } from '../design/KeepHeart';
import { useNowPlayingStore } from '../lib/azuracast';
import { usePlayer } from '../lib/player';
import { useTrackActions } from '../hooks/useTrackActions';
import { useArtistPage } from '../hooks/useArtistPage';
import { artistPath } from '../lib/artistProfile';
import { CoverOpenLarge } from '../design/CoverOpenLarge';
import { ARTIST_LINK, TEXT_ACTION } from '../design/classes';
import { VolumeControl, type VolumeControlProps } from '../shell/VolumeControl';
import {
  LISTEN_PILL,
  ListenDisc,
  listenAria,
  listenLabel,
  listenState,
  type ListenState,
} from './listen';
import * as m from '@/paraglide/messages.js';

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
  /** No answer from the station yet: the hero says so rather than wait in silence. */
  isUnreachable?: boolean;
  listen: ListenState;
  onToggleListen: () => void;
  isKept: boolean;
  isKeeping: boolean;
  onToggleKeep: () => void;
  /** The artist's page, once it exists: no link rather than a dead one. */
  artistHref: string | null;
  /** True once the live has moved past the track shown at load: changes then animate. */
  hasChanged?: boolean;
  /** The hero's own volume: the player bar stays away while the hero shows. */
  volume: Omit<VolumeControlProps, 'className' | 'showLevel'>;
  /** The block of the words and Écouter, which the hero watches for the player bar. */
  liveRef?: Ref<HTMLDivElement> | undefined;
}

/**
 * The cover's width in each layout of the hero (design/tokens.css, hero-cover): beside the column,
 * the screen's height under the 4.5rem header, or what the column's 32rem leaves; above it, the
 * screen's width, held under the height the words below it need.
 */
const HERO_COVER_SIZES = [
  '(min-width: 48rem) and (orientation: landscape) min(100vh - 4.5rem, 100vw - 32rem)',
  'min(100vw, max(16rem, 100vh - 27rem))',
].join(', ');

/** Garder beside Écouter: the heart in a ring as tall as the pill, named for the track. */
const KEEP_RING =
  'group ease-out-quart focus-visible:outline-accent border-border hover:bg-surface-raised flex size-13 shrink-0 items-center justify-center rounded-full border transition-[background-color,scale] duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-90 disabled:opacity-50';

/** Écouter: the ink pill, its disc and its word, as in the phone's sheet; the line's width there. */
function ListenPill({ listen, onToggle }: { listen: ListenState; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={listenAria(listen)}
      aria-busy={listen === 'connecting'}
      className={cn(LISTEN_PILL, 'phone:flex-1 w-auto')}
    >
      <ListenDisc state={listen} className="size-11" />
      <span className="text-ui font-semibold">{listenLabel(listen)}</span>
    </button>
  );
}

/**
 * What plays now: the cover, square, the largest thing on the page and nothing ever written over
 * it; then, in the column beside it (under it on a phone), « En direct », the title, the artist (a
 * link to their page once it exists) and its album, and the ink Écouter pill with Garder and the
 * volume. Two blocks of the hero's grid (design/tokens.css, hero-cover and hero-live).
 */
export function NowPlayingView({
  track,
  isOnline,
  isUnreachable = false,
  listen,
  onToggleListen,
  isKept,
  isKeeping,
  onToggleKeep,
  artistHref,
  hasChanged = false,
  volume,
  liveRef,
}: NowPlayingViewProps) {
  const trackKey = track ? `${track.artist}|${track.title}` : 'none';
  const album = track ? shownAlbum(track.album, track.title) : null;
  return (
    <>
      <div className="hero-cover lift-in">
        {track ? (
          <CoverOpenLarge
            src={track.art}
            alt={m.now_cover_alt({ title: track.title, artist: track.artist })}
            seed={`${track.artist}|${track.title}`}
            label={m.cover_open({ title: track.title })}
            title={track.title}
            largeAlt={m.now_cover_alt({ title: track.title, artist: track.artist })}
            caption={m.track_caption({ title: track.title, artist: track.artist })}
            priority
            sizes={HERO_COVER_SIZES}
            triggerClassName="size-full"
            className={cn('size-full', hasChanged && 'swap-in')}
          />
        ) : (
          <div aria-hidden="true" className="bg-surface-raised size-full" />
        )}
      </div>

      <div ref={liveRef} className="hero-live lift-in-late">
        {!isOnline ? (
          <p className="text-intro text-text-muted m-0" aria-live="polite">
            {m.off_air()}
          </p>
        ) : track ? (
          <div key={trackKey} className={cn('flex flex-col', hasChanged && 'swap-in-late')}>
            <p className="text-ui hero-split:mb-3.5 m-0 mb-1 flex items-center gap-2 font-semibold">
              {/* The station is live: a still dot, the one that beats is the horizon's. */}
              <span aria-hidden="true" className="bg-dawn-ink size-1.75 shrink-0 rounded-full" />
              {m.now_live()}
            </p>
            {/* Three lines at most: the whole title stays in the page for screen readers. */}
            <h2 className="font-display text-track m-0 line-clamp-3 text-balance">{track.title}</h2>
            <p className="text-intro m-0 mt-2">
              {/* Inline padding grows the tap target to 44px without moving the line. */}
              {artistHref ? (
                <Link to={artistHref} className={cn(ARTIST_LINK, 'py-3 underline-offset-5')}>
                  {track.artist}
                </Link>
              ) : (
                track.artist
              )}
              {album ? (
                <span className="text-text-muted">
                  {' · '}
                  <cite className="not-italic">{album}</cite>
                </span>
              ) : null}
            </p>
          </div>
        ) : isUnreachable ? (
          <p className="text-intro text-text-muted m-0" aria-live="polite">
            {m.now_unreachable()}
          </p>
        ) : (
          <div aria-busy="true" className="flex flex-col gap-2">
            <span className="bg-surface-raised h-14 w-3/4" />
            <span className="bg-surface-raised h-6 w-1/3" />
          </div>
        )}

        <div className="hero-split:mt-7 mt-3 flex items-center gap-3">
          <ListenPill listen={listen} onToggle={onToggleListen} />
          {track && isOnline ? (
            <button
              type="button"
              onClick={onToggleKeep}
              disabled={isKeeping}
              aria-pressed={isKept}
              aria-label={m.track_keep_aria({ title: track.title })}
              className={KEEP_RING}
            >
              <KeepHeart isKept={isKept} className="size-6" />
            </button>
          ) : null}
          {/* A phone sets the level with its own buttons (and iOS ignores it from a page). */}
          <VolumeControl {...volume} showLevel className="phone:hidden ml-1.5" />
        </div>
      </div>
    </>
  );
}

export function NowPlaying({ liveRef }: { liveRef?: Ref<HTMLDivElement> }) {
  const { title, artist, album, art, isOnline, isUnreachable } = useNowPlayingStore(
    useShallow((s) => ({
      title: s.data?.now_playing?.song.title,
      artist: s.data?.now_playing?.song.artist,
      album: s.data?.now_playing?.song.album,
      art: s.data?.now_playing?.song.art,
      isOnline: s.data?.is_online ?? true,
      // The store keeps polling, with backoff: the track replaces this once it answers.
      isUnreachable: !s.data && s.error !== null,
    }))
  );
  const { isPlaying, isConnecting, toggle } = usePlayer(
    useShallow((s) => ({ isPlaying: s.isPlaying, isConnecting: s.isConnecting, toggle: s.toggle }))
  );
  const volume = useVolume();
  const { isLiked, isLiking, handleToggleLike } = useTrackActions();
  const artistPage = useArtistPage(artist);
  const trackKey = title && artist ? `${artist}|${title}` : null;
  const [firstTrackKey, setFirstTrackKey] = useState<string | null>(null);
  if (firstTrackKey === null && trackKey !== null) setFirstTrackKey(trackKey);

  return (
    <NowPlayingView
      track={title && artist ? { title, artist, album: album ?? '', art } : null}
      isOnline={isOnline}
      isUnreachable={isUnreachable}
      listen={listenState(isPlaying, isConnecting)}
      onToggleListen={toggle}
      isKept={isLiked}
      isKeeping={isLiking}
      onToggleKeep={handleToggleLike}
      artistHref={artistPage ? artistPath(artistPage) : null}
      hasChanged={firstTrackKey !== null && trackKey !== firstTrackKey}
      volume={volume}
      liveRef={liveRef}
    />
  );
}

/** The player's volume, for the hero's VolumeControl. */
function useVolume(): NowPlayingViewProps['volume'] {
  const { volume, isMuted, setVolume, toggleMute } = usePlayer(
    useShallow((s) => ({
      volume: s.volume,
      isMuted: s.isMuted,
      setVolume: s.setVolume,
      toggleMute: s.toggleMute,
    }))
  );
  return { volume, isMuted, onVolumeChange: setVolume, onToggleMute: toggleMute };
}

/**
 * When the track on air cannot be shown, its zone says so and nothing else goes: the header, the
 * rest of the hero and the horizon stay, and the live can still be heard.
 */
export function NowPlayingFallback({
  resetErrorBoundary,
  liveRef,
}: FallbackProps & { liveRef?: Ref<HTMLDivElement> }) {
  const { isPlaying, isConnecting, toggle } = usePlayer(
    useShallow((s) => ({ isPlaying: s.isPlaying, isConnecting: s.isConnecting, toggle: s.toggle }))
  );
  const listen = listenState(isPlaying, isConnecting);
  const volume = useVolume();
  return (
    <div ref={liveRef} role="alert" className="hero-live flex flex-col gap-2">
      <p className="font-display text-section m-0">{m.error_track_title()}</p>
      <p className="text-intro text-text-muted m-0">{m.error_track_body()}</p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <ListenPill listen={listen} onToggle={toggle} />
        <button type="button" onClick={resetErrorBoundary} className={TEXT_ACTION}>
          {m.error_retry()}
        </button>
        <VolumeControl {...volume} showLevel className="phone:hidden" />
      </div>
    </div>
  );
}
