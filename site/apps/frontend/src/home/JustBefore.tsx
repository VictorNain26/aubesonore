import { Link } from 'react-router';
import { ErrorBoundary } from 'react-error-boundary';
import { cn } from '@/lib/utils';
import { Cover } from '../design/Cover';
import { KeepButton } from '../design/KeepButton';
import { ARTIST_LINK } from '../design/classes';
import { useLikeAction } from '../hooks/useLikeAction';
import { artistPath } from '../lib/artistProfile';
import { useLikedTracksStore, isTrackLiked, trackKey } from '../stores/likedTracksStore';
import { useArtistPage } from '../hooks/useArtistPage';
import { usePreviousTrack } from './usePreviousTrack';
import type { Swap } from './useTrackSwap';
import { useNowPlayingStore, type SongEntry } from '../lib/azuracast';
import * as m from '@/paraglide/messages.js';

/** Garder beside a track of the hero: the heart alone, a 44 px target named for its title. */
const KEEP_ICON =
  'group ease-out-quart focus-visible:outline-accent flex size-11 shrink-0 items-center justify-center transition-[scale,opacity] duration-150 hover:opacity-70 focus-visible:outline-2 active:scale-90 disabled:opacity-50';

export interface JustBeforeViewProps {
  track: {
    title: string;
    artist: string;
    art: string | null;
    /** The artist's page, once it exists: no link rather than a dead one. */
    artistHref: string | null;
    isKept: boolean;
    isKeeping: boolean;
  } | null;
  onToggleKeep: () => void;
  /** Where the hero is in a change of track: it leaves and comes back with it. */
  swap?: Swap;
  /** The live has not answered yet: its room is kept, so the column does not move when it does. */
  waiting?: boolean;
}

/**
 * « Juste avant »: the one track that played before the one on air, under the player, to keep
 * when it was heard too late (home/Hero.tsx). Its cover, its title, its artist (a link to their
 * page) and Garder; nothing to play, the live is the one thing that plays. Nothing before the
 * first track has played.
 */
export function JustBeforeView({
  track,
  onToggleKeep,
  swap = 'idle',
  waiting = false,
}: JustBeforeViewProps) {
  if (!track) {
    if (!waiting) return null;
    // Its label's line, its cover, its two lines and the heart's room, no title over what may not
    // come; the same element as the track's, so it is not drawn in again when the track comes.
    return (
      <section aria-busy="true" data-testid="hero-before-waiting" className="hero-before">
        <span className="text-small mb-2 block h-lh" />
        <span className="flex items-center gap-3">
          <span className="bg-surface-raised hero-split:size-14 size-11 shrink-0" />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-body bg-surface-raised h-lh w-2/3" />
            <span className="text-small bg-surface-raised h-lh w-1/3" />
          </span>
          <span className="size-11 shrink-0" />
        </span>
      </section>
    );
  }
  return (
    <section aria-labelledby="just-before-title" data-swap={swap} className="hero-before">
      <h2 id="just-before-title" className="text-small text-text-muted m-0 mb-2 font-normal">
        {m.just_before_title()}
      </h2>
      <div className="flex items-center gap-3">
        <Cover
          src={track.art}
          alt=""
          seed={`${track.artist}|${track.title}`}
          lowPriority
          // 44 px on a phone, 56 beside the cover on air (hero-split, design/tokens.css).
          sizes="(min-width: 40rem) and (orientation: landscape) 3.5rem, 2.75rem"
          className="hero-split:size-14 size-11 shrink-0"
        />
        <span className="flex min-w-0 flex-col">
          <span className="text-body truncate font-semibold">{track.title}</span>
          {track.artistHref ? (
            // Negative margins grow the tap target to 44px without moving the row.
            <Link
              to={track.artistHref}
              className={cn(
                ARTIST_LINK,
                'text-small text-text-muted -my-3 self-start truncate py-3 underline-offset-3'
              )}
            >
              {track.artist}
            </Link>
          ) : (
            <span className="text-small text-text-muted truncate">{track.artist}</span>
          )}
        </span>
        <KeepButton
          title={track.title}
          isKept={track.isKept}
          isKeeping={track.isKeeping}
          onToggle={onToggleKeep}
          className={KEEP_ICON}
          heartClassName="size-5"
        />
      </div>
    </section>
  );
}

/**
 * « Juste avant » for the track the hero shows (`shown`, the one on air when null). A track it
 * cannot show leaves nothing, the rest of the page standing, until the next track (as the track on
 * air does, home/NowPlaying.tsx: NowPlayingFallback).
 */
export function JustBefore({ shown, swap }: { shown: SongEntry | null; swap: Swap }) {
  return (
    <ErrorBoundary fallback={null} resetKeys={[shown?.sh_id]}>
      <JustBeforeTrack shown={shown} swap={swap} />
    </ErrorBoundary>
  );
}

function JustBeforeTrack({ shown, swap }: { shown: SongEntry | null; swap: Swap }) {
  const entry = usePreviousTrack(shown);
  // Until the station's first answer, which brings the track before with the one on air.
  const waiting = useNowPlayingStore((s) => s.data === null && s.error === null);
  const tracks = useLikedTracksStore((s) => s.tracks);
  const { likingTrackId, toggleLike } = useLikeAction();
  // The same resolver as the track on air: the page it found then is reused, from its cache.
  const page = useArtistPage(entry?.song.artist);

  return (
    <JustBeforeView
      track={
        entry
          ? {
              title: entry.song.title,
              artist: entry.song.artist,
              art: entry.song.art,
              artistHref: page ? artistPath(page) : null,
              isKept: isTrackLiked(tracks, entry.song.title, entry.song.artist),
              isKeeping: likingTrackId === trackKey(entry.song.title, entry.song.artist),
            }
          : null
      }
      swap={swap}
      waiting={waiting}
      onToggleKeep={() => {
        if (entry) void toggleLike(entry.song.title, entry.song.artist);
      }}
    />
  );
}
