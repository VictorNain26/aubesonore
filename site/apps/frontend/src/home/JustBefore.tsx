import { Link } from 'react-router';
import { cn } from '@/lib/utils';
import { Cover } from '../design/Cover';
import { KeepHeart } from '../design/KeepHeart';
import { ARTIST_LINK } from '../design/classes';
import { useLikeAction } from '../hooks/useLikeAction';
import { artistPath } from '../lib/artistProfile';
import { useLikedTracksStore, isTrackLiked, trackKey } from '../stores/likedTracksStore';
import { useArtistPage } from '../hooks/useArtistPage';
import { usePreviousTrack } from './usePreviousTrack';
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
}

/**
 * « Juste avant »: the one track that played before the one on air, under the player, to keep
 * when it was heard too late (home/Hero.tsx). Its cover, its title, its artist (a link to their
 * page) and Garder; nothing to play, the live is the one thing that plays. Nothing before the
 * first track has played.
 */
export function JustBeforeView({ track, onToggleKeep }: JustBeforeViewProps) {
  if (!track) return null;
  return (
    <section aria-labelledby="just-before-title" className="hero-before">
      <h2 id="just-before-title" className="text-label text-text-muted m-0 mb-2 font-normal">
        {m.just_before_title()}
      </h2>
      <div className="flex items-center gap-3">
        <Cover
          src={track.art}
          alt=""
          seed={`${track.artist}|${track.title}`}
          lowPriority
          // 44 px on a phone, 56 beside the cover on air (hero-split, design/tokens.css).
          sizes="(min-width: 48rem) and (orientation: landscape) 3.5rem, 2.75rem"
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
                'text-label text-text-muted -my-3 self-start truncate py-3 underline-offset-3'
              )}
            >
              {track.artist}
            </Link>
          ) : (
            <span className="text-label text-text-muted truncate">{track.artist}</span>
          )}
        </span>
        <button
          type="button"
          onClick={onToggleKeep}
          disabled={track.isKeeping}
          aria-pressed={track.isKept}
          aria-label={m.track_keep_aria({ title: track.title })}
          className={KEEP_ICON}
        >
          <KeepHeart isKept={track.isKept} className="size-5" />
        </button>
      </div>
    </section>
  );
}

export function JustBefore() {
  const entry = usePreviousTrack();
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
      onToggleKeep={() => {
        if (entry) void toggleLike(entry.song.title, entry.song.artist, entry.song.art);
      }}
    />
  );
}
