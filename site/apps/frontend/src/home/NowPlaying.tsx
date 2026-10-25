import { useState } from 'react';
import type { FallbackProps } from 'react-error-boundary';
import { Link } from 'react-router';
import { useShallow } from 'zustand/react/shallow';
import { ShareIcon } from '../design/icons';
import { cn } from '@/lib/utils';
import { KeepHeart } from '../design/KeepHeart';
import { useNowPlayingStore } from '../lib/azuracast';
import { usePlayer } from '../lib/player';
import { useTrackActions } from '../hooks/useTrackActions';
import { useArtistPage } from '../hooks/useArtistPage';
import { artistPath } from '../lib/artistProfile';
import { CoverOpenLarge } from '../design/CoverOpenLarge';
import { ARTIST_LINK, TEXT_ACTION } from '../design/classes';
import { CastControl } from '../shell/CastControl';
import { useDiffusion, type Diffusion } from '../hooks/useDiffusion';
import { VolumeControl, type VolumeControlProps } from '../shell/VolumeControl';
import { ListenDisc, listenAria, listenState, type ListenState } from './listen';
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
  onShare: () => void;
  /** AirPlay or Chromecast, where the browser can cast. */
  diffusion?: Diffusion | null;
  /** The artist's page, once it exists: no link rather than a dead one. */
  artistHref: string | null;
  /** True once the live has moved past the track shown at load: changes then animate. */
  hasChanged?: boolean;
  /** The hero's own volume: the player bar stays away while the hero shows. */
  volume: Omit<VolumeControlProps, 'className'>;
}

/** The hero cover's width in each layout of the hero (design/tokens.css, hero-main and cover-fit). */
const HERO_SPLIT_COVER = 'clamp(26rem, 77vh - 14.5rem, 42vw)';
const HERO_COVER_SIZES = [
  `(min-width: 64rem) and (min-height: 30rem) ${HERO_SPLIT_COVER}`,
  `(min-width: 48rem) and (orientation: landscape) and (min-height: 30rem) ${HERO_SPLIT_COVER}`,
  '(orientation: landscape) and (max-height: 30rem) min(100vh - 7rem, 40vw)',
  '(min-width: 48rem) min(100vw - 5rem, 100vh - 32rem)',
  'min(100vw - 3rem, 100vh - 30rem)',
].join(', ');

/** Écouter, the one round thing of the page: an ink disc, larger from md. */
const LISTEN_DISC =
  'group ease-spring focus-visible:outline-accent shrink-0 rounded-full transition-transform duration-200 focus-visible:outline-2 focus-visible:outline-offset-4 active:scale-95';
/** 52 px on a phone (upright or on its side), 64, then 80 from md. */
const DISC_SIZE = 'size-16 md:size-20 phone:size-13';

/**
 * What plays now, the biggest thing on the page: the cover, « En direct » in its corner while on
 * air, the title, the artist (a link to their page once it exists) and its album, and the round
 * Écouter right under them, beside Garder (a heart), Partager, Diffuser and the volume, on one
 * line. The cover takes the room the hero leaves it (design/tokens.css, hero-player); the title, at
 * a human size, holds on three lines. What played before is the thread beside or below.
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
  onShare,
  diffusion = null,
  artistHref,
  hasChanged = false,
  volume,
}: NowPlayingViewProps) {
  const trackKey = track ? `${track.artist}|${track.title}` : 'none';
  const album = track ? shownAlbum(track.album, track.title) : null;
  return (
    <div className="hero-player">
      <div className="lift-in cover-room [grid-area:cover]">
        {track ? (
          <div className="cover-fit relative">
            <CoverOpenLarge
              src={track.art}
              alt={m.now_cover_alt({ title: track.title, artist: track.artist })}
              seed={`${track.artist}|${track.title}`}
              label={m.cover_open({ title: track.title })}
              title={track.title}
              largeAlt={m.now_cover_alt({ title: track.title, artist: track.artist })}
              caption={m.track_caption({ title: track.title, artist: track.artist })}
              priority
              // cover-fit (design/tokens.css): beside the thread, the player's column (the height
              // the hero leaves, 77vh - 14.5rem, from 26rem to 42% of the screen); on a phone on
              // its side, the screen's height less the header's; stacked, the line less the
              // gutters or what the title, the actions and the thread's first lines leave of the
              // screen's height (player-room).
              sizes={HERO_COVER_SIZES}
              triggerClassName="size-full"
              className={cn('shadow-cover size-full', hasChanged && 'swap-in')}
            />
            {isOnline ? (
              <span className="bg-tag text-on-tag text-caption pointer-events-none absolute top-2.5 left-2.5 flex items-center gap-1.5 py-1.5 pr-2.5 pl-2 leading-none font-normal md:top-3 md:left-3">
                <span aria-hidden="true" className="bg-dawn size-1.5 rounded-full" />
                {m.now_live()}
              </span>
            ) : null}
          </div>
        ) : (
          <div aria-hidden="true" className="cover-fit bg-surface-raised" />
        )}
      </div>

      <div className="lift-in-late flex min-w-0 flex-col [grid-area:meta]">
        {!isOnline ? (
          <p className="text-intro text-text-muted m-0" aria-live="polite">
            {m.off_air()}
          </p>
        ) : track ? (
          <div key={trackKey} className={cn('flex flex-col gap-2', hasChanged && 'swap-in-late')}>
            {/* Three lines at most: the whole title stays in the page for screen readers. */}
            <h2 className="font-display text-track m-0 line-clamp-3 text-balance">{track.title}</h2>
            <p className="text-headline m-0 font-normal">
              {/* Inline padding grows the tap target to 44px without moving the line. */}
              {artistHref ? (
                <Link to={artistHref} className={cn(ARTIST_LINK, 'py-3 underline-offset-6')}>
                  {track.artist}
                </Link>
              ) : (
                track.artist
              )}
              {album ? (
                <span className="text-text-muted">
                  {' · '}
                  <cite>{album}</cite>
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
            <span className="bg-surface-raised h-16 w-3/4" />
            <span className="bg-surface-raised h-7 w-1/3" />
          </div>
        )}
      </div>

      <div className="hero-actions lift-in-late [grid-area:actions]">
        <div>
          <button
            type="button"
            onClick={onToggleListen}
            aria-label={listenAria(listen)}
            aria-busy={listen === 'connecting'}
            className={LISTEN_DISC}
          >
            <ListenDisc state={listen} tone="ink" className={DISC_SIZE} />
          </button>
          {track && isOnline ? (
            <>
              <button
                type="button"
                onClick={onToggleKeep}
                disabled={isKeeping}
                aria-pressed={isKept}
                aria-label={m.track_keep()}
                title={m.track_keep()}
                className={TEXT_ACTION}
              >
                <KeepHeart isKept={isKept} className="size-5.5" />
              </button>
              <button type="button" onClick={onShare} className={TEXT_ACTION}>
                <ShareIcon className="size-4" />
                <span data-label>{m.track_share()}</span>
              </button>
              {diffusion ? <CastControl diffusion={diffusion} variant="text" /> : null}
            </>
          ) : null}
          <VolumeControl {...volume} />
        </div>
      </div>
    </div>
  );
}

export function NowPlaying() {
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
  const { isLiked, isLiking, handleToggleLike, handleShare } = useTrackActions();
  const diffusion = useDiffusion();
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
      onShare={handleShare}
      diffusion={diffusion}
      artistHref={artistPage ? artistPath(artistPage) : null}
      hasChanged={firstTrackKey !== null && trackKey !== firstTrackKey}
      volume={volume}
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
 * dawn and the horizon stay, and the live can still be heard.
 */
export function NowPlayingFallback({ resetErrorBoundary }: FallbackProps) {
  const { isPlaying, isConnecting, toggle } = usePlayer(
    useShallow((s) => ({ isPlaying: s.isPlaying, isConnecting: s.isConnecting, toggle: s.toggle }))
  );
  const listen = listenState(isPlaying, isConnecting);
  const volume = useVolume();
  return (
    <div role="alert" className="flex flex-col justify-end gap-2">
      <p className="font-display text-section m-0">{m.error_track_title()}</p>
      <p className="text-intro text-text-muted m-0">{m.error_track_body()}</p>
      <div className="hero-actions mt-4 md:mt-6">
        <div>
          <button
            type="button"
            onClick={toggle}
            aria-label={listenAria(listen)}
            aria-busy={listen === 'connecting'}
            className={LISTEN_DISC}
          >
            <ListenDisc state={listen} tone="ink" className={DISC_SIZE} />
          </button>
          <button type="button" onClick={resetErrorBoundary} className={TEXT_ACTION}>
            {m.error_retry()}
          </button>
          <VolumeControl {...volume} />
        </div>
      </div>
    </div>
  );
}
