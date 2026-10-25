import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { cn } from '@/lib/utils';
import { KeepHeart } from '../design/KeepHeart';
import { PlayIcon } from '../design/icons';
import type { SongEntry } from '../lib/azuracast';
import type { Loaded } from '../lib/homeData';
import { usePlayer } from '../lib/player';
import { youtubeSearchUrl } from '../lib/pendingKeep';
import { useRecentTracks } from './useRecentTracks';
import { useLikeAction } from '../hooks/useLikeAction';
import { useLikedTracksStore, isTrackLiked, trackKey } from '../stores/likedTracksStore';
import { useArtistPages } from './useArtistPages';
import { artistPath } from '../lib/artistProfile';
import { CoverOpenLarge } from '../design/CoverOpenLarge';
import { formatClock } from '../lib/time';
import { ARTIST_LINK, ICON_ACTION } from '../design/classes';
import * as m from '@/paraglide/messages.js';
import { LineLoader } from '../design/LineLoader';

/** The closing line's height (design/tokens.css, thread-leave), after which it leaves the page. */
export const THREAD_CLOSE_MS = 420;

const idsOf = (rows: readonly ThreadRow[]) => rows.map((r) => r.id).join();

export interface ThreadRow {
  id: number;
  playedAt: number;
  title: string;
  artist: string;
  /** The artist's page, once the antenna's record knows it: no link rather than a dead one. */
  artistHref: string | null;
  /** A YouTube search for the track (lib/pendingKeep.ts). */
  youtubeUrl: string;
  art: string | null;
  isKept: boolean;
  isKeeping: boolean;
}

export interface SinceDawnViewProps {
  rows: ThreadRow[];
  status: 'loading' | 'error' | 'ready';
  onToggleKeep: (id: number) => void;
  /** A track opened on YouTube: the live gives way to it. */
  onListenElsewhere: () => void;
}

/**
 * The last tracks before the one on air, beside the player or under it (home/Hero.tsx). When the
 * track changes, the one that played opens a line at the head and the oldest's line closes at the
 * foot, still drawn while it closes, out of reach.
 */
export function SinceDawnView({
  rows,
  status,
  onToggleKeep,
  onListenElsewhere,
}: SinceDawnViewProps) {
  // Rows present at first load stay still, and so do older ones the history brings after the
  // live's: only a track played since opens its line.
  const [since, setSince] = useState<number | null>(null);
  if (since === null && rows.length > 0) setSince(Math.max(...rows.map((r) => r.playedAt)));
  // The rows last drawn, and the ones gone since, which close before they leave.
  const [last, setLast] = useState(rows);
  const [leaving, setLeaving] = useState<ThreadRow[]>([]);
  if (idsOf(last) !== idsOf(rows)) {
    const ids = new Set(rows.map((r) => r.id));
    const gone = last.filter((r) => !ids.has(r.id));
    setLast(rows);
    if (gone.length > 0 && last.length > 0) {
      setLeaving((prev) => [...prev.filter((r) => !ids.has(r.id)), ...gone]);
    }
  }
  useEffect(() => {
    if (leaving.length === 0) return;
    const timer = setTimeout(() => setLeaving([]), THREAD_CLOSE_MS);
    return () => clearTimeout(timer);
  }, [leaving]);

  return (
    <section
      id="depuis-l-aube"
      aria-labelledby="since-dawn-title"
      className="flex min-w-0 scroll-mt-10 flex-col self-start"
    >
      <h2
        id="since-dawn-title"
        className="font-display text-title border-text m-0 border-b pb-3 font-medium"
      >
        {m.since_dawn_title()}
      </h2>

      {status === 'loading' && rows.length === 0 ? (
        <LineLoader className="min-h-60" />
      ) : rows.length === 0 ? (
        <p className="text-text-muted m-0 pt-4">
          {status === 'error' ? m.since_dawn_error() : m.since_dawn_empty()}
        </p>
      ) : (
        <ol className="m-0 list-none p-0">
          {rows.map((row) => (
            <Line
              key={row.id}
              row={row}
              motion={since !== null && row.playedAt > since ? 'enter' : null}
              onToggleKeep={onToggleKeep}
              onListenElsewhere={onListenElsewhere}
            />
          ))}
          {leaving.map((row) => (
            <Line
              key={row.id}
              row={row}
              motion="leave"
              onToggleKeep={onToggleKeep}
              onListenElsewhere={onListenElsewhere}
            />
          ))}
        </ol>
      )}
    </section>
  );
}

function Line({
  row,
  motion,
  onToggleKeep,
  onListenElsewhere,
}: {
  row: ThreadRow;
  motion: 'enter' | 'leave' | null;
  onToggleKeep: (id: number) => void;
  onListenElsewhere: () => void;
}) {
  const leaves = motion === 'leave';
  return (
    <li
      className={cn('thread-line', motion === 'enter' && 'thread-enter', leaves && 'thread-leave')}
      aria-hidden={leaves ? true : undefined}
      inert={leaves}
    >
      <div className="min-h-0 overflow-hidden">
        <div className="thread-row wave-rule ease-out-soft hover:bg-accent/3 grid grid-cols-[2.5rem_auto_minmax(0,1fr)_auto_auto] items-center gap-x-2 py-1 transition-colors duration-300 md:grid-cols-[3.25rem_auto_minmax(0,1fr)_auto_auto] md:gap-x-3">
          <span className="text-ui text-text-muted font-normal whitespace-nowrap tabular-nums">
            {formatClock(row.playedAt)}
          </span>
          <CoverOpenLarge
            src={row.art}
            alt=""
            seed={`${row.artist}|${row.title}`}
            label={m.cover_open({ title: row.title })}
            title={row.title}
            largeAlt={m.now_cover_alt({ title: row.title, artist: row.artist })}
            caption={m.track_caption({ title: row.title, artist: row.artist })}
            sizes="3.5rem"
            lowPriority
            triggerClassName="thread-cover"
            className="size-full"
          />
          <span className="flex min-w-0 flex-col">
            <span className="text-row truncate">{row.title}</span>
            {row.artistHref ? (
              // Negative margins grow the tap target to 44px without moving the row.
              <Link
                to={row.artistHref}
                className={cn(
                  ARTIST_LINK,
                  'text-sub text-text-muted -my-3 self-start truncate py-3 underline-offset-4'
                )}
              >
                {row.artist}
              </Link>
            ) : (
              <span className="text-sub text-text-muted truncate">{row.artist}</span>
            )}
          </span>
          <a
            href={row.youtubeUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onListenElsewhere}
            aria-label={m.library_listen({ title: row.title })}
            title={m.library_listen({ title: row.title })}
            className={ICON_ACTION}
          >
            <PlayIcon className="size-4.5" />
          </a>
          <button
            type="button"
            onClick={() => onToggleKeep(row.id)}
            disabled={row.isKeeping}
            aria-pressed={row.isKept}
            aria-label={m.track_keep_aria({ title: row.title })}
            title={m.track_keep()}
            className={cn(ICON_ACTION, 'group')}
          >
            <KeepHeart
              isKept={row.isKept}
              className="ease-spring size-4.5 transition-transform duration-250 group-hover:scale-118"
            />
          </button>
        </div>
      </div>
    </li>
  );
}

export function SinceDawn({ history }: { history: Loaded<SongEntry[]> | null }) {
  const { entries, isLoading, error } = useRecentTracks(history);
  const tracks = useLikedTracksStore((s) => s.tracks);
  const { likingTrackId, toggleLike } = useLikeAction();
  const pages = useArtistPages(entries.map((e) => e.song.artist));

  const rows: ThreadRow[] = entries.map((e) => {
    const page = pages.get(e.song.artist);
    return {
      id: e.sh_id,
      playedAt: e.played_at,
      title: e.song.title,
      artist: e.song.artist,
      artistHref: page ? artistPath(page) : null,
      youtubeUrl: youtubeSearchUrl(e.song.title, e.song.artist),
      art: e.song.art,
      isKept: isTrackLiked(tracks, e.song.title, e.song.artist),
      isKeeping: likingTrackId === trackKey(e.song.title, e.song.artist),
    };
  });

  return (
    <SinceDawnView
      rows={rows}
      status={isLoading ? 'loading' : error ? 'error' : 'ready'}
      onToggleKeep={(id) => {
        const entry = entries.find((e) => e.sh_id === id);
        if (entry) void toggleLike(entry.song.title, entry.song.artist, entry.song.art);
      }}
      onListenElsewhere={() => {
        // Two sounds over each other are worse than a pause: Écouter takes the live back.
        const player = usePlayer.getState();
        if (player.isPlaying || player.isConnecting) player.stop();
      }}
    />
  );
}
