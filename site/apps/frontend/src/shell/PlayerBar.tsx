import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useShallow } from 'zustand/react/shallow';
import { cn } from '@/lib/utils';
import { KeepButton } from '../design/KeepButton';
import { useNowPlayingStore } from '../lib/azuracast';
import { useHasHeroPlayer, useHeroPlayerStore } from '../stores/heroPlayerStore';
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
import { CoverLight } from '../design/CoverLight';
import { shownAlbum } from '../design/onAir';
import {
  ListenDisc,
  ListenPill,
  listenAria,
  listenLabel,
  listenState,
  type ListenState,
} from '../home/listen';
import * as m from '@/paraglide/messages.js';

const ICON_BUTTON =
  'ease-out-quart focus-visible:outline-on-accent flex size-11 shrink-0 items-center justify-center rounded-full transition-[opacity,scale] duration-150 hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-90 disabled:opacity-50';

export interface PlayerBarViewProps {
  /** Away while the page's own player, the hero's, is on screen: one player at a time. */
  isHidden: boolean;
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
  'ease-out-quart focus-visible:outline-on-accent flex min-w-0 items-center gap-3.5 rounded-full py-1 pr-2 transition-opacity duration-150 hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 active:opacity-60';

/**
 * The live player, pinned to the bottom of every page, laid out as the hero: lit by the cover on
 * air under a veil of its own colour, the light changing with the track as the hero's does. On a
 * computer: Écouter with its word on the page's gutter, the track (its cover, its title, the live
 * dot, its artist and album, leading to the artist's page) and Garder right after it, then the
 * volume and Diffuser at the far end. On a phone: the track, which opens its sheet, Garder, and
 * Écouter's disc at the right, under the thumb; no volume, the phone's own buttons set it, as on
 * the hero. On the home page it springs in once the hero's player has scrolled away and leaves
 * when it comes back, so there is never two players on screen. Every page keeps its height free at
 * the bottom (`pb-bar`), so it hides nothing. When the live moves on, the cover comes into focus
 * and the words fade in. The site's line runs along its top edge, alive while the live is heard.
 */
export function PlayerBarView({
  isHidden,
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
  const [hasFocus, setHasFocus] = useState(false);
  // Never hide the bar while it holds the keyboard focus (WCAG 2.4.11). Only the keyboard's: a
  // mouse click focuses a button too (Chrome), and the bar must still leave when the listener
  // scrolls back to the hero.
  const hidden = isHidden && !hasFocus;
  const onAir = track && isOnline ? track : null;

  return (
    <section
      aria-label={m.player_label()}
      inert={hidden}
      onFocus={(e) => setHasFocus(e.target.matches(':focus-visible'))}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setHasFocus(false);
      }}
      className={cn(
        // Edge to edge, on the screen's foot (the mockups); its content keeps the page's gutters.
        'player-bar bg-accent text-on-accent fixed inset-x-0 bottom-0 z-40',
        'ease-spring motion-safe:transition-[translate,opacity] motion-safe:duration-500',
        hidden && 'pointer-events-none translate-y-full opacity-0'
      )}
    >
      {/* Off air, no light. */}
      <CoverLight art={onAir?.art ?? null} />
      {/* The line along its top edge, in the dawn: calm at rest, listening while the live is
          heard. Out of the flow, over the edge: the bar keeps its height. */}
      <HorizonLine
        isPlaying={listen === 'playing'}
        traces={1}
        ink="dawn"
        amplitude={BAR_LINE_AMPLITUDE}
        className="pointer-events-none absolute inset-x-0 -top-3 h-6 w-full"
      />
      {/* On phones the gaps tighten (the 44 px targets stay) so the title keeps a few more
          letters. */}
      <div className="px-page relative flex items-center gap-2 py-2.5 md:gap-0 md:py-3.5">
        <ListenPill
          listen={listen}
          onToggle={onToggleListen}
          place="bar"
          className="mr-7 hidden shrink-0 md:flex"
        />

        {onAir ? (
          <>
            {/* A phone opens the whole track in a sheet; a larger screen goes to the artist's page. */}
            <span className="flex min-w-0 flex-1 md:hidden">
              <NowPlayingSheet
                track={onAir}
                artistHref={artistHref}
                listen={listen}
                onToggleListen={onToggleListen}
                isKept={isKept}
                onToggleKeep={onToggleKeep}
                onShare={onShare}
                diffusion={diffusion}
              >
                <TrackLine track={onAir} hasChanged={hasChanged} />
              </NowPlayingSheet>
            </span>
            <span className="hidden min-w-0 md:flex">
              {artistHref ? (
                <Link
                  to={artistHref}
                  title={`${onAir.title}, ${onAir.artist}`}
                  className={TRACK_LINK}
                >
                  <TrackLine track={onAir} hasChanged={hasChanged} withAlbum />
                </Link>
              ) : (
                <span
                  title={`${onAir.title}, ${onAir.artist}`}
                  className="flex min-w-0 items-center gap-3.5"
                >
                  <TrackLine track={onAir} hasChanged={hasChanged} withAlbum />
                </span>
              )}
            </span>
            <KeepButton
              title={onAir.title}
              isKept={isKept}
              onToggle={onToggleKeep}
              className={cn(ICON_BUTTON, 'md:ml-1.5')}
              heartClassName="size-5"
            />
          </>
        ) : (
          // Écouter's word, which the computer's pill already says; off air, the silence.
          <span
            className={cn(
              'text-ui min-w-0 flex-1 truncate font-semibold md:flex-none',
              isOnline && 'md:hidden'
            )}
          >
            {isOnline ? listenLabel(listen) : m.off_air()}
          </span>
        )}

        <span aria-hidden="true" className="hidden flex-1 md:block" />

        {/* Where a mouse sets it, as on the hero: a phone or a tablet has its own buttons. */}
        <VolumeControl
          volume={volume}
          isMuted={isMuted}
          onVolumeChange={onVolumeChange}
          onToggleMute={onToggleMute}
          className="md:fine-pointer:flex hidden"
        />

        {/* Diffuser is in the track's sheet on a phone. */}
        {diffusion ? (
          <span className="hidden md:ml-6 md:flex">
            <CastControl diffusion={diffusion} variant="bar" />
          </span>
        ) : null}

        {/* Écouter under the thumb on a phone: the disc alone, at the right. */}
        <button
          type="button"
          onClick={onToggleListen}
          aria-label={listenAria(listen)}
          aria-busy={listen === 'connecting'}
          className="group ease-spring focus-visible:outline-on-accent shrink-0 rounded-full transition-transform duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-95 md:hidden"
        >
          <ListenDisc state={listen} className="size-12" />
        </button>
      </div>
    </section>
  );
}

/**
 * The track's cover and words: its title, then the live dot and its artist, with its album on a
 * computer (not a single's, which repeats the title).
 */
function TrackLine({
  track,
  hasChanged,
  withAlbum = false,
}: {
  track: NonNullable<PlayerBarViewProps['track']>;
  hasChanged: boolean;
  withAlbum?: boolean;
}) {
  const key = `${track.artist}|${track.title}`;
  const album = withAlbum ? shownAlbum(track.album, track.title) : null;
  return (
    <>
      <Cover
        key={key}
        src={track.art}
        alt=""
        seed={key}
        sizes="3rem"
        className={cn('size-11 shrink-0 md:size-12', hasChanged && 'swap-in')}
      />
      <span
        key={`${key}:words`}
        className={cn('flex min-w-0 flex-col', hasChanged && 'swap-in-late')}
      >
        <span className="text-ui truncate font-semibold">{track.title}</span>
        <span className="text-caption text-on-accent-muted flex min-w-0 items-center gap-1.5">
          {/* The station is live: the dawn's still dot, as « En direct » on the hero. */}
          <span aria-hidden="true" className="bg-dawn size-1.5 shrink-0 rounded-full" />
          <span className="truncate">{album ? `${track.artist} · ${album}` : track.artist}</span>
        </span>
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
  const heroPlayerInView = useHeroPlayerStore((s) => s.inView);
  const hasHeroPlayer = useHasHeroPlayer();
  const { restoreVolume } = player;
  useEffect(() => {
    restoreVolume();
    initializeAirPlay();
    initializeCast();
  }, [restoreVolume, initializeAirPlay, initializeCast]);

  return (
    <PlayerBarView
      isHidden={hasHeroPlayer && heroPlayerInView}
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
