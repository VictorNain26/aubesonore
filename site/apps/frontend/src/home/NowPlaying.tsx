import { useState } from 'react';
import type { FallbackProps } from 'react-error-boundary';
import { Link } from 'react-router';
import { useShallow } from 'zustand/react/shallow';
import { Share2 } from 'lucide-react';
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
import { ListenDisc, listenAria, listenState, type ListenState } from './listen';
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
}

/** Écouter, the one round thing of the page: an ink disc, larger from md. */
const LISTEN_DISC =
  'group ease-spring focus-visible:outline-accent shrink-0 rounded-full transition-transform duration-200 focus-visible:outline-2 focus-visible:outline-offset-4 active:scale-95';

/**
 * What plays now, the biggest thing on the page: the cover, the title, the artist (a link to their
 * page once it exists) and its album, and the round Écouter right under them, beside Garder,
 * Partager and Diffuser. The volume is the player bar's, always on screen. What played before is
 * the thread below.
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
}: NowPlayingViewProps) {
  const trackKey = track ? `${track.artist}|${track.title}` : 'none';
  const album = track ? shownAlbum(track.album, track.title) : null;
  return (
    <div className="wide:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] wide:items-end wide:gap-x-16 grid w-full gap-6">
      <div className="lift-in">
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
            // artwork-size: 46svh wide, 60svh from 64rem (design/tokens.css).
            sizes="(min-width: 64rem) 60vh, 46vh"
            triggerClassName="artwork-size aspect-square"
            className={cn('shadow-cover size-full', hasChanged && 'swap-in')}
          />
        ) : (
          <div aria-hidden="true" className="artwork-size bg-surface-raised aspect-square" />
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
                'font-display m-0 text-balance',
                track.title.length > LONG_TITLE ? 'text-hero' : 'text-now'
              )}
            >
              {track.title}
            </h2>
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

        <div className="mt-4 flex items-center gap-6 md:mt-6">
          <button
            type="button"
            onClick={onToggleListen}
            aria-label={listenAria(listen)}
            aria-busy={listen === 'connecting'}
            className={LISTEN_DISC}
          >
            <ListenDisc state={listen} tone="ink" className="size-16 md:size-20" />
          </button>
          {track && isOnline ? (
            <span className="flex flex-wrap gap-x-6">
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
              {diffusion ? <CastControl diffusion={diffusion} variant="text" /> : null}
            </span>
          ) : null}
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
    />
  );
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
  return (
    <div role="alert" className="flex flex-col gap-2">
      <p className="font-display text-section m-0">{m.error_track_title()}</p>
      <p className="text-intro text-text-muted m-0">{m.error_track_body()}</p>
      <div className="mt-4 flex items-center gap-6 md:mt-6">
        <button
          type="button"
          onClick={toggle}
          aria-label={listenAria(listen)}
          aria-busy={listen === 'connecting'}
          className={LISTEN_DISC}
        >
          <ListenDisc state={listen} tone="ink" className="size-16 md:size-20" />
        </button>
        <button type="button" onClick={resetErrorBoundary} className={TEXT_ACTION}>
          {m.error_retry()}
        </button>
      </div>
    </div>
  );
}
