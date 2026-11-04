import type { Ref } from 'react';
import type { FallbackProps } from 'react-error-boundary';
import { useShallow } from 'zustand/react/shallow';
import { KeepButton } from '../design/KeepButton';
import { retryNowPlaying, useNowPlayingStore, type SongEntry } from '../lib/azuracast';
import { useTrackActions } from '../hooks/useTrackActions';
import { usePlayer } from '../lib/player';
import { useLikeAction } from '../hooks/useLikeAction';
import { useLikedTracksStore, isTrackLiked, trackKey } from '../stores/likedTracksStore';
import type { Swap } from './useTrackSwap';
import { useArtistPage } from '../hooks/useArtistPage';
import { artistPath } from '../lib/artistProfile';
import { CoverOpenLarge } from '../design/CoverOpenLarge';
import { KEEP_RING, OUTLINE_ACTION, TEXT_ACTION } from '../design/classes';
import { LiveMark, TrackCredit } from '../design/onAir';
import { VolumeControl, type VolumeControlProps } from '../shell/VolumeControl';
import { CastControl } from '../shell/CastControl';
import { useDiffusion, type Diffusion } from '../hooks/useDiffusion';
import { ListenPill, listenState, type ListenState } from './listen';
import { cn } from '@/lib/utils';
import * as m from '@/paraglide/messages.js';

const OFF_AIR_TITLE = 'font-display text-title m-0 text-balance';

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
  /** Réessayer, while the station does not answer: asks it again now. */
  onRetry?: () => void;
  listen: ListenState;
  onToggleListen: () => void;
  isKept: boolean;
  isKeeping: boolean;
  onToggleKeep: () => void;
  /** The artist's page, once it exists: no link rather than a dead one. */
  artistHref: string | null;
  /** Where the hero is in a change of track (home/useTrackSwap.ts): the blocks animate by it. */
  swap?: Swap;
  /** The hero's own volume: the player bar stays away while the hero shows. */
  volume: Omit<VolumeControlProps, 'className'>;
  /**
   * AirPlay or Chromecast, wherever the browser can cast, as Google's checklist asks: with no
   * device found, its help says what to check (shell/CastControl.tsx).
   */
  diffusion?: Diffusion | null;
  /** The block of the words and Écouter, which the hero watches for the player bar. */
  liveRef?: Ref<HTMLDivElement> | undefined;
}

/**
 * The cover's width, the hero's one formula (design/tokens.css, hero, --hero-cover) written in vw
 * (`sizes` knows only the screen; the hero spans it): beside the column, the screen's height less
 * the header, its 24 px and the horizon (9.5rem), or the width less both gutters, the column's
 * 26rem and its 3.5rem of air. The gutters written out: 2.5rem from 48rem, half of what passes
 * 100rem past it, so the cover is 70.5rem at most; 1.5rem below 48rem. Above the words, the
 * screen's width, held under the height the header, its 24 px and the words need (28.5rem).
 */
export const HERO_COVER_SIZES = [
  '(min-width: 48rem) and (orientation: landscape) min(100vh - 9.5rem, 100vw - 34.5rem, 70.5rem)',
  '(min-width: 40rem) and (orientation: landscape) min(100vh - 9.5rem, 100vw - 32.5rem)',
  'min(100vw, max(9rem, 100vh - 28.5rem))',
].join(', ');

/**
 * Écouter in the hero: its own width at least, the rest of its line on a phone, its own alone from
 * 40rem. The row of actions wraps rather than squeeze or overflow the screen.
 */
const HERO_PILL = 'grow sm:grow-0';

/**
 * What plays now: the cover, square, the largest thing on the page and nothing ever written over
 * it; then, in the column beside it (under it on a phone), « En direct », the title, the artist (a
 * link to their page once it exists) and its album, and the ink Écouter pill with Garder, the
 * volume and Diffuser. Two blocks of the hero's grid (design/tokens.css, hero-cover and hero-live).
 */
export function NowPlayingView({
  track,
  isOnline,
  isUnreachable = false,
  onRetry,
  listen,
  onToggleListen,
  isKept,
  isKeeping,
  onToggleKeep,
  artistHref,
  swap = 'idle',
  volume,
  diffusion = null,
  liveRef,
}: NowPlayingViewProps) {
  const trackKey = track ? `${track.artist}|${track.title}` : 'none';
  // Off air or unreachable, nothing to hear, so nothing to do; but a live still heard keeps its
  // Arrêter.
  const hasNothing = !isOnline || (!track && isUnreachable);
  return (
    <>
      <div
        data-testid="hero-cover"
        data-swap={swap}
        data-off-air={isOnline ? undefined : true}
        className="hero-cover swap-cover"
      >
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
            // Under the pointer the cover grows a little (a dimmed one read as disabled); its focus
            // ring inside it, clear of the hero's edge.
            triggerClassName="size-full hover:opacity-100 motion-safe:hover:scale-102 focus-visible:-outline-offset-4"
            className="size-full"
          />
        ) : (
          <div aria-hidden="true" className="bg-surface-raised size-full" />
        )}
      </div>

      <div ref={liveRef} className="hero-live">
        {!isOnline ? (
          // Nothing on air: the sentence takes the title's place, at its size.
          <h2 className={OFF_AIR_TITLE} aria-live="polite">
            {m.off_air()}
          </h2>
        ) : track ? (
          <div
            key={trackKey}
            data-testid="hero-words"
            data-swap={swap}
            className="swap-words flex flex-col"
          >
            <LiveMark className="mb-3" />
            {/* Whole, the one thing the hero must say in full: a long title takes the lines it
                needs (beside the cover it raises « En direct », the column standing on the cover's
                foot), a word wider than the line breaks. */}
            <h2 className="font-display text-title m-0 text-balance wrap-break-word">
              {track.title}
            </h2>
            <TrackCredit
              artist={track.artist}
              album={track.album}
              title={track.title}
              artistHref={artistHref}
              className="mt-2 line-clamp-2"
            />
          </div>
        ) : isUnreachable ? (
          <div className="flex flex-col items-start gap-5">
            <h2 className={OFF_AIR_TITLE} aria-live="polite">
              {m.now_unreachable()}
            </h2>
            {onRetry ? (
              // A framed button of the forms' height, 48 px.
              <button type="button" onClick={onRetry} className={cn(OUTLINE_ACTION, 'h-12')}>
                {m.error_retry()}
              </button>
            ) : null}
          </div>
        ) : (
          // The words' room until the live answers: a line of « En direct », of the title and of
          // the credit, each at its size and with its air, so nothing moves when they come.
          <div aria-busy="true" className="flex flex-col">
            <span data-testid="hero-words-waiting" className="text-body mb-3 h-lh" />
            <span
              data-testid="hero-words-waiting"
              className="font-display text-title bg-surface-raised h-lh w-3/4"
            />
            <span
              data-testid="hero-words-waiting"
              className="text-line bg-surface-raised mt-2 h-lh w-1/3"
            />
          </div>
        )}

        {hasNothing && listen === 'idle' ? null : hasNothing ? (
          <div className="mt-6 flex">
            <ListenPill listen={listen} onToggle={onToggleListen} className={HERO_PILL} />
          </div>
        ) : (
          <HeroActions
            listen={listen}
            onToggleListen={onToggleListen}
            keep={track ? { title: track.title, isKept, isKeeping, onToggle: onToggleKeep } : null}
            volume={volume}
            diffusion={diffusion}
          />
        )}
      </div>
    </>
  );
}

interface HeroActionsProps {
  listen: ListenState;
  onToggleListen: () => void;
  /** Garder for the track shown; none without a track. */
  keep: { title: string; isKept: boolean; isKeeping: boolean; onToggle: () => void } | null;
  volume: Omit<VolumeControlProps, 'className'>;
  diffusion: Diffusion | null;
  children?: React.ReactNode;
}

/** Écouter, Garder, the volume and Diffuser: the hero's row, its error fallback's too. */
function HeroActions({
  listen,
  onToggleListen,
  keep,
  volume,
  diffusion,
  children,
}: HeroActionsProps) {
  return (
    <div className="mt-6 flex flex-wrap items-center gap-3">
      <ListenPill listen={listen} onToggle={onToggleListen} className={HERO_PILL} />
      {keep ? (
        <KeepButton
          title={keep.title}
          isKept={keep.isKept}
          isKeeping={keep.isKeeping}
          onToggle={keep.onToggle}
          className={KEEP_RING}
          heartClassName="size-6"
        />
      ) : null}
      {children}
      {/* Where a mouse sets it: a phone sets the level with its own buttons (and iOS ignores
          it from a page). */}
      <VolumeControl {...volume} className="fine-pointer:flex ml-1.5 hidden" />
      {diffusion ? <CastControl diffusion={diffusion} variant="hero" /> : null}
    </div>
  );
}

/**
 * The track the hero shows (`shown`, home/useTrackSwap.ts: the one on air, or the last one while
 * the next comes in), with its own Garder, so a press keeps the track in view.
 */
export function NowPlaying({
  shown,
  swap,
  liveRef,
}: {
  shown: SongEntry | null;
  swap: Swap;
  liveRef?: Ref<HTMLDivElement>;
}) {
  const { isOnline, isUnreachable } = useNowPlayingStore(
    useShallow((s) => ({
      isOnline: s.data?.is_online ?? true,
      // The store keeps polling, with backoff: the track replaces this once it answers.
      isUnreachable: !s.data && s.error !== null,
    }))
  );
  const { isPlaying, isConnecting, toggle } = usePlayer(
    useShallow((s) => ({ isPlaying: s.isPlaying, isConnecting: s.isConnecting, toggle: s.toggle }))
  );
  const volume = useVolume();
  const tracks = useLikedTracksStore((s) => s.tracks);
  const { likingTrackId, toggleLike } = useLikeAction();
  const diffusion = useDiffusion();
  const song = shown?.song;
  const artistPage = useArtistPage(song?.artist);

  return (
    <NowPlayingView
      track={
        song?.title && song.artist
          ? { title: song.title, artist: song.artist, album: song.album, art: song.art }
          : null
      }
      isOnline={isOnline}
      isUnreachable={isUnreachable}
      onRetry={retryNowPlaying}
      listen={listenState(isPlaying, isConnecting)}
      onToggleListen={toggle}
      isKept={song ? isTrackLiked(tracks, song.title, song.artist) : false}
      isKeeping={song ? likingTrackId === trackKey(song.title, song.artist) : false}
      onToggleKeep={() => {
        if (song) void toggleLike(song.title, song.artist);
      }}
      artistHref={artistPage ? artistPath(artistPage) : null}
      swap={swap}
      volume={volume}
      diffusion={diffusion}
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
  const volume = useVolume();
  const diffusion = useDiffusion();
  const { title, isLiked, isLiking, handleToggleLike } = useTrackActions();
  return (
    <NowPlayingFallbackView
      listen={listenState(isPlaying, isConnecting)}
      onToggleListen={toggle}
      volume={volume}
      keep={
        title ? { title, isKept: isLiked, isKeeping: isLiking, onToggle: handleToggleLike } : null
      }
      diffusion={diffusion}
      onRetry={resetErrorBoundary}
      liveRef={liveRef}
    />
  );
}

export interface NowPlayingFallbackViewProps extends Omit<HeroActionsProps, 'children'> {
  onRetry: () => void;
  liveRef?: Ref<HTMLDivElement> | undefined;
}

/** The fallback's words, then the hero's own row, Réessayer beside the heart. */
export function NowPlayingFallbackView({
  onRetry,
  liveRef,
  ...actions
}: NowPlayingFallbackViewProps) {
  return (
    <div ref={liveRef} role="alert" className="hero-live flex flex-col gap-2">
      <p className="font-display text-title m-0">{m.error_track_title()}</p>
      <p className="text-line text-text-muted m-0">{m.error_track_body()}</p>
      <HeroActions {...actions}>
        <button type="button" onClick={onRetry} className={TEXT_ACTION}>
          {m.error_retry()}
        </button>
      </HeroActions>
    </div>
  );
}
