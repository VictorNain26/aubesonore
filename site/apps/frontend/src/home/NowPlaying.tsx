import type { Ref } from 'react';
import type { FallbackProps } from 'react-error-boundary';
import { useShallow } from 'zustand/react/shallow';
import { KeepButton } from '../design/KeepButton';
import { isDefaultArtwork, useNowPlayingStore, type SongEntry } from '../lib/azuracast';
import { usePlayer } from '../lib/player';
import { useLikeAction } from '../hooks/useLikeAction';
import { useLikedTracksStore, isTrackLiked, trackKey } from '../stores/likedTracksStore';
import { artworkSrc, artworkSrcSet } from '../lib/artwork';
import type { Swap } from './useTrackSwap';
import { useArtistPage } from '../hooks/useArtistPage';
import { artistPath } from '../lib/artistProfile';
import { CoverOpenLarge } from '../design/CoverOpenLarge';
import { KEEP_RING, TEXT_ACTION } from '../design/classes';
import { LiveMark, TrackCredit } from '../design/onAir';
import { VolumeControl, type VolumeControlProps } from '../shell/VolumeControl';
import { CastControl } from '../shell/CastControl';
import { useDiffusion, type Diffusion } from '../hooks/useDiffusion';
import { ListenPill, listenState, type ListenState } from './listen';
import * as m from '@/paraglide/messages.js';

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
 * The cover's width in each layout of the hero (design/tokens.css, hero, --hero-cover): beside
 * the column, the screen's height less the header and its 24 px (6rem) and the horizon it rests on
 * (3.5rem), or what the gutter and the column's 32rem leave, the gutter written out (--hero-gutter:
 * 2.5rem from 48rem, or half of what passes 100rem; 1.5rem below); above it, the screen's width,
 * held under the height the header's 16 px and the words below it need (28rem).
 */
const HERO_COVER_SIZES = [
  '(min-width: 48rem) and (orientation: landscape) min(100vh - 9.5rem, 100vw - 34.5rem, 50vw + 18rem)',
  '(min-width: 40rem) and (orientation: landscape) min(100vh - 9.5rem, 100vw - 33.5rem)',
  'min(100vw, max(9rem, 100vh - 28rem))',
].join(', ');

/**
 * The next cover, fetched and decoded as the hero will draw it (same files, same sizes), so it
 * comes in whole rather than as an empty square (home/useTrackSwap.ts).
 */
export function preloadCover(art: string | undefined): Promise<void> {
  if (!art || isDefaultArtwork(art)) return Promise.resolve();
  const image = new Image();
  image.referrerPolicy = 'no-referrer';
  image.sizes = HERO_COVER_SIZES;
  const set = artworkSrcSet(art);
  if (set) image.srcset = set;
  image.src = artworkSrc(art);
  return image.decode();
}

/** Écouter in the hero: the line's width on a phone, its own from 40rem. */
const HERO_PILL = 'flex-1 sm:flex-none';

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
  return (
    <>
      <div
        data-testid="hero-cover"
        data-swap={swap}
        data-off-air={isOnline ? undefined : true}
        className="hero-cover"
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
          <p className="text-intro text-text-muted m-0" aria-live="polite">
            {m.off_air()}
          </p>
        ) : track ? (
          <div
            key={trackKey}
            data-testid="hero-words"
            data-swap={swap}
            className="hero-words flex flex-col"
          >
            <LiveMark className="mb-3" />
            {/* Two lines at most on a phone, three beside the cover, where a longer title raises
                « En direct » (the column stands on the cover's foot); the whole title stays in the
                page for screen readers. */}
            <h2 className="font-display text-track hero-split:line-clamp-3 m-0 line-clamp-2 text-balance">
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
          <p className="text-intro text-text-muted m-0" aria-live="polite">
            {m.now_unreachable()}
          </p>
        ) : (
          <div aria-busy="true" className="flex flex-col gap-2">
            <span className="bg-surface-raised h-14 w-3/4" />
            <span className="bg-surface-raised h-6 w-1/3" />
          </div>
        )}

        <div className="mt-6 flex items-center gap-3">
          <ListenPill listen={listen} onToggle={onToggleListen} className={HERO_PILL} />
          {track && isOnline ? (
            <KeepButton
              title={track.title}
              isKept={isKept}
              isKeeping={isKeeping}
              onToggle={onToggleKeep}
              className={KEEP_RING}
              heartClassName="size-6"
            />
          ) : null}
          {/* Where a mouse sets it: a phone sets the level with its own buttons (and iOS ignores
              it from a page). */}
          <VolumeControl {...volume} className="fine-pointer:flex ml-1.5 hidden" />
          {diffusion ? <CastControl diffusion={diffusion} variant="hero" /> : null}
        </div>
      </div>
    </>
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
      listen={listenState(isPlaying, isConnecting)}
      onToggleListen={toggle}
      isKept={song ? isTrackLiked(tracks, song.title, song.artist) : false}
      isKeeping={song ? likingTrackId === trackKey(song.title, song.artist) : false}
      onToggleKeep={() => {
        if (song) void toggleLike(song.title, song.artist, song.art);
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
  const listen = listenState(isPlaying, isConnecting);
  const volume = useVolume();
  return (
    <div ref={liveRef} role="alert" className="hero-live flex flex-col gap-2">
      <p className="font-display text-section m-0">{m.error_track_title()}</p>
      <p className="text-intro text-text-muted m-0">{m.error_track_body()}</p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <ListenPill listen={listen} onToggle={toggle} className={HERO_PILL} />
        <button type="button" onClick={resetErrorBoundary} className={TEXT_ACTION}>
          {m.error_retry()}
        </button>
        <VolumeControl {...volume} className="fine-pointer:flex hidden" />
      </div>
    </div>
  );
}
