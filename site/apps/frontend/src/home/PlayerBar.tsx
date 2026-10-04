import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { useShallow } from 'zustand/react/shallow';
import { Airplay } from 'lucide-react';
import { cn } from '@/lib/utils';
import { KeepHeart } from './KeepHeart';
import { useNowPlayingStore } from '../lib/azuracast';
import { usePlayer } from '../lib/player';
import { useAirPlayStore } from '../stores/airplayStore';
import { useTrackActions } from '../hooks/player/useTrackActions';
import { useArtistPage } from '../hooks/useArtistPage';
import { artistPath } from '../lib/artistProfile';
import { Cover } from './Cover';
import { VolumeControl } from './VolumeControl';
import {
  ListenDisc,
  listenAria,
  listenLabel,
  listenState,
  useHeroListenVisible,
  type ListenState,
} from './listen';
import * as m from '@/paraglide/messages.js';

const ICON_BUTTON =
  'ease-out-quart focus-visible:outline-on-accent flex size-11 shrink-0 items-center justify-center rounded-full transition-opacity duration-150 hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2';

export interface PlayerBarViewProps {
  /** Hidden while the hero's own Écouter button is on screen. */
  isHidden: boolean;
  listen: ListenState;
  onToggleListen: () => void;
  track: { title: string; artist: string; art: string | undefined; playedAt: number } | null;
  isKept: boolean;
  onToggleKeep: () => void;
  volume: number;
  isMuted: boolean;
  onVolumeChange: (value: number) => void;
  onToggleMute: () => void;
  airPlay: { isActive: boolean; onOpen: () => void } | null;
  /** The page of the artist on air, once it exists: the track leads there. */
  artistHref: string | null;
  isOnline: boolean;
  /** True once the live has moved past the track shown first: the change then animates. */
  hasChanged?: boolean;
}

const TRACK_LINK =
  'ease-out-quart focus-visible:outline-on-accent flex min-w-0 flex-1 items-center gap-3 rounded-full py-1 pr-2 transition-opacity duration-150 hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 active:opacity-60';

/**
 * The live player, one bar for every screen: pinned to the bottom, it springs in
 * once the hero's Écouter button has scrolled away, so there is never two of
 * them on screen. Every page keeps its height free at the bottom (`pb-bar`), so it
 * hides nothing. The track leads to the artist's page; when the live moves on, the
 * cover comes into focus and the words fade in. Volume sits in it with a mouse;
 * phones use their buttons.
 */
export function PlayerBarView({
  isHidden,
  listen,
  onToggleListen,
  track,
  isKept,
  onToggleKeep,
  volume,
  isMuted,
  onVolumeChange,
  onToggleMute,
  airPlay,
  artistHref,
  isOnline,
  hasChanged = false,
}: PlayerBarViewProps) {
  const [hasFocus, setHasFocus] = useState(false);
  // Never hide the bar while it holds the keyboard focus (WCAG 2.4.11). Only the
  // keyboard's: a mouse click focuses a button too (Chrome), and the bar must
  // still leave when the listener scrolls back to the hero.
  const hidden = isHidden && !hasFocus;

  return (
    <section
      aria-label={m.player_label()}
      inert={hidden}
      onFocus={(e) => setHasFocus(e.target.matches(':focus-visible'))}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setHasFocus(false);
      }}
      className={cn(
        'bg-accent text-on-accent shadow-bar bottom-safe max-w-bar fixed inset-x-3 z-40 mx-auto flex items-center gap-3 rounded-full py-1.5 pr-3 pl-1.5',
        'ease-spring transition-[translate,opacity] duration-500',
        hidden && 'pointer-events-none translate-y-24 opacity-0'
      )}
    >
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
        artistHref ? (
          <Link to={artistHref} title={`${track.title}, ${track.artist}`} className={TRACK_LINK}>
            <TrackLine track={track} hasChanged={hasChanged} />
          </Link>
        ) : (
          <span
            title={`${track.title}, ${track.artist}`}
            className="flex min-w-0 flex-1 items-center gap-3"
          >
            <TrackLine track={track} hasChanged={hasChanged} />
          </span>
        )
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
        tone="accent"
      />

      {airPlay ? (
        <button
          type="button"
          onClick={airPlay.onOpen}
          aria-label={airPlay.isActive ? m.airplay_active() : m.airplay_open()}
          aria-pressed={airPlay.isActive}
          className={ICON_BUTTON}
        >
          <Airplay className="size-4" aria-hidden="true" />
        </button>
      ) : null}
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
  const { title, artist, art, playedAt, isOnline } = useNowPlayingStore(
    useShallow((s) => ({
      title: s.data?.now_playing?.song.title,
      artist: s.data?.now_playing?.song.artist,
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
  const airPlay = useAirPlayStore(
    useShallow((s) => ({
      available: s.available,
      isActive: s.isActive,
      initialize: s.initialize,
      openPicker: s.openPicker,
    }))
  );
  const { isLiked, handleToggleLike } = useTrackActions();
  const heroListenVisible = useHeroListenVisible((s) => s.visible);
  const { restoreVolume } = player;
  const { initialize } = airPlay;

  useEffect(() => {
    restoreVolume();
    initialize();
  }, [restoreVolume, initialize]);

  return (
    <PlayerBarView
      isHidden={heroListenVisible}
      listen={listenState(player.isPlaying, player.isConnecting)}
      onToggleListen={player.toggle}
      track={title && artist && playedAt !== undefined ? { title, artist, art, playedAt } : null}
      isKept={isLiked}
      onToggleKeep={handleToggleLike}
      volume={player.volume}
      isMuted={player.isMuted}
      onVolumeChange={player.setVolume}
      onToggleMute={player.toggleMute}
      airPlay={
        airPlay.available ? { isActive: airPlay.isActive, onOpen: airPlay.openPicker } : null
      }
      artistHref={artistPage ? artistPath(artistPage) : null}
      isOnline={isOnline}
      hasChanged={firstTrackKey !== null && trackKey !== firstTrackKey}
    />
  );
}
