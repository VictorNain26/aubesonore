import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useShallow } from 'zustand/react/shallow';
import { cn } from '@/lib/utils';
import { KeepHeart } from '../design/KeepHeart';
import { useNowPlayingStore } from '../lib/azuracast';
import { usePlayer } from '../lib/player';
import { useAirPlayStore } from '../stores/airplayStore';
import { useCastStore } from '../stores/castStore';
import { useDiffusion, type Diffusion } from '../hooks/useDiffusion';
import { CastControl } from './CastControl';
import { useTrackActions } from '../hooks/useTrackActions';
import { useArtistPage } from '../hooks/useArtistPage';
import { artistPath } from '../lib/artistProfile';
import { Cover } from '../design/Cover';
import { VolumeControl } from './VolumeControl';
import { NowPlayingSheet } from './NowPlayingSheet';
import { HorizonLine } from '../home/HorizonLine';
import { ListenDisc, listenAria, listenLabel, listenState, type ListenState } from '../home/listen';
import * as m from '@/paraglide/messages.js';

const ICON_BUTTON =
  'ease-out-quart focus-visible:outline-on-accent flex size-11 shrink-0 items-center justify-center rounded-full transition-opacity duration-150 hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2';

export interface PlayerBarViewProps {
  listen: ListenState;
  onToggleListen: () => void;
  track: {
    title: string;
    artist: string;
    album: string;
    art: string | undefined;
    playedAt: number;
  } | null;
  isKept: boolean;
  onToggleKeep: () => void;
  onShare: () => void;
  volume: number;
  isMuted: boolean;
  onVolumeChange: (value: number) => void;
  onToggleMute: () => void;
  /** AirPlay or Chromecast, where the browser can cast; null elsewhere. */
  diffusion: Diffusion | null;
  /** The page of the artist on air, once it exists: the track leads there. */
  artistHref: string | null;
  isOnline: boolean;
  /** True once the live has moved past the track shown first: the change then animates. */
  hasChanged?: boolean;
}

/** The edge line's rest swell, as a share of its 24 px: a pixel and a quarter; seven and a half
 *  while the live is heard. */
const BAR_LINE_AMPLITUDE = 1.25 / 24;

const TRACK_LINK =
  'ease-out-quart focus-visible:outline-on-accent flex min-w-0 flex-1 items-center gap-3 rounded-full py-1 pr-2 transition-opacity duration-150 hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 active:opacity-60';

/**
 * The live player, one bar for every screen, pinned to the bottom of every page, the home page's
 * hero included: the volume is always at hand there. Every page keeps its height free at the
 * bottom (`pb-bar`), so it hides nothing. The track leads to the artist's page; when the live
 * moves on, the cover comes into focus and the words fade in. The site's line runs along its top
 * edge, alive while the live is heard.
 */
export function PlayerBarView({
  listen,
  onToggleListen,
  track,
  isKept,
  onToggleKeep,
  onShare,
  volume,
  isMuted,
  onVolumeChange,
  onToggleMute,
  diffusion,
  artistHref,
  isOnline,
  hasChanged = false,
}: PlayerBarViewProps) {
  return (
    <section
      aria-label={m.player_label()}
      // On phones the gaps tighten (the 44 px targets stay) so the title keeps a few more letters.
      className="bg-accent text-on-accent shadow-bar bottom-safe max-w-bar fixed inset-x-3 z-40 mx-auto flex items-center gap-2 py-1.5 pr-1.5 pl-1.5 md:gap-3 md:pr-3"
    >
      {/* The line along its top edge, in the dawn: calm at rest, listening while the live is
          heard. Out of the flow, over the edge: the bar keeps its height. */}
      <HorizonLine
        isPlaying={listen === 'playing'}
        traces={1}
        ink="dawn"
        amplitude={BAR_LINE_AMPLITUDE}
        className="pointer-events-none absolute inset-x-0 -top-3 h-6 w-full"
      />
      <button
        type="button"
        onClick={onToggleListen}
        aria-label={listenAria(listen)}
        aria-busy={listen === 'connecting'}
        className="group ease-spring focus-visible:outline-on-accent shrink-0 rounded-full transition-transform duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-95"
      >
        <ListenDisc state={listen} className="size-12" />
      </button>

      {track && isOnline ? (
        <>
          {/* A phone opens the whole track in a sheet; a larger screen goes to the artist's page. */}
          <span className="flex min-w-0 flex-1 md:hidden">
            <NowPlayingSheet
              track={track}
              artistHref={artistHref}
              listen={listen}
              onToggleListen={onToggleListen}
              isKept={isKept}
              onToggleKeep={onToggleKeep}
              onShare={onShare}
              diffusion={diffusion}
            >
              <TrackLine track={track} hasChanged={hasChanged} />
            </NowPlayingSheet>
          </span>
          <span className="hidden min-w-0 flex-1 md:flex">
            {artistHref ? (
              <Link
                to={artistHref}
                title={`${track.title}, ${track.artist}`}
                className={TRACK_LINK}
              >
                <TrackLine track={track} hasChanged={hasChanged} />
              </Link>
            ) : (
              <span
                title={`${track.title}, ${track.artist}`}
                className="flex min-w-0 flex-1 items-center gap-3"
              >
                <TrackLine track={track} hasChanged={hasChanged} />
              </span>
            )}
          </span>
        </>
      ) : (
        <span className="text-ui min-w-0 flex-1 truncate font-semibold">
          {isOnline ? listenLabel(listen) : m.off_air()}
        </span>
      )}

      {track && isOnline ? (
        <button
          type="button"
          onClick={onToggleKeep}
          aria-pressed={isKept}
          aria-label={m.track_keep_aria({ title: track.title })}
          className={ICON_BUTTON}
        >
          <KeepHeart isKept={isKept} className="size-4" />
        </button>
      ) : null}

      <VolumeControl
        volume={volume}
        isMuted={isMuted}
        onVolumeChange={onVolumeChange}
        onToggleMute={onToggleMute}
      />

      {diffusion ? <CastControl diffusion={diffusion} variant="bar" /> : null}
    </section>
  );
}

function TrackLine({
  track,
  hasChanged,
}: {
  track: NonNullable<PlayerBarViewProps['track']>;
  hasChanged: boolean;
}) {
  const key = `${track.artist}|${track.title}`;
  return (
    <>
      <Cover
        key={key}
        src={track.art}
        alt=""
        seed={key}
        sizes="2.5rem"
        className={cn('size-10 shrink-0', hasChanged && 'swap-in')}
      />
      <span
        key={`${key}:words`}
        className={cn('flex min-w-0 flex-col', hasChanged && 'swap-in-late')}
      >
        <span className="text-ui truncate font-semibold">{track.title}</span>
        <span className="text-caption text-on-accent-muted truncate">{track.artist}</span>
      </span>
    </>
  );
}

export function PlayerBar() {
  const { title, artist, album, art, playedAt, isOnline } = useNowPlayingStore(
    useShallow((s) => ({
      title: s.data?.now_playing?.song.title,
      artist: s.data?.now_playing?.song.artist,
      album: s.data?.now_playing?.song.album,
      art: s.data?.now_playing?.song.art,
      playedAt: s.data?.now_playing?.played_at,
      isOnline: s.data?.is_online ?? true,
    }))
  );
  const artistPage = useArtistPage(artist);
  const trackKey = title && artist ? `${artist}|${title}` : null;
  const [firstTrackKey, setFirstTrackKey] = useState<string | null>(null);
  if (firstTrackKey === null && trackKey !== null) setFirstTrackKey(trackKey);
  const player = usePlayer(
    useShallow((s) => ({
      isPlaying: s.isPlaying,
      isConnecting: s.isConnecting,
      toggle: s.toggle,
      volume: s.volume,
      isMuted: s.isMuted,
      setVolume: s.setVolume,
      toggleMute: s.toggleMute,
      restoreVolume: s.restoreVolume,
    }))
  );
  const initializeAirPlay = useAirPlayStore((s) => s.initialize);
  const initializeCast = useCastStore((s) => s.initialize);
  const diffusion = useDiffusion();
  const { isLiked, handleToggleLike, handleShare } = useTrackActions();
  const { restoreVolume } = player;
  useEffect(() => {
    restoreVolume();
    initializeAirPlay();
    initializeCast();
  }, [restoreVolume, initializeAirPlay, initializeCast]);

  return (
    <PlayerBarView
      listen={listenState(player.isPlaying, player.isConnecting)}
      onToggleListen={player.toggle}
      track={
        title && artist && playedAt !== undefined
          ? { title, artist, album: album ?? '', art, playedAt }
          : null
      }
      isKept={isLiked}
      onToggleKeep={handleToggleLike}
      onShare={handleShare}
      volume={player.volume}
      isMuted={player.isMuted}
      onVolumeChange={player.setVolume}
      onToggleMute={player.toggleMute}
      diffusion={diffusion}
      artistHref={artistPage ? artistPath(artistPage) : null}
      isOnline={isOnline}
      hasChanged={firstTrackKey !== null && trackKey !== firstTrackKey}
    />
  );
}
