import { useState } from 'react';
import { Link } from 'react-router';
import { cn } from '@/lib/utils';
import { KeepHeart } from './KeepHeart';
import { useNowPlayingStore } from '../lib/azuracast';
import { useTodayHistory } from '../hooks/useTodayHistory';
import { useLikeAction } from '../hooks/player/useLikeAction';
import { useLikedTracksStore, isTrackLiked } from '../stores/likedTracksStore';
import { useArtistPages } from '../hooks/useArtistPages';
import { artistPath } from '../lib/artistProfile';
import { Cover } from './Cover';
import { formatClock } from './time';
import { ARTIST_LINK, TEXT_ACTION } from './styles';
import * as m from '@/paraglide/messages.js';

const PAGE = 10;

export interface ThreadRow {
  id: number;
  playedAt: number;
  title: string;
  artist: string;
  /** The artist's page, once the antenna's record knows it: no link rather than a dead one. */
  artistHref: string | null;
  art: string | null;
  isNow: boolean;
  isKept: boolean;
  isKeeping: boolean;
}

export interface SinceDawnViewProps {
  rows: ThreadRow[];
  status: 'loading' | 'error' | 'ready';
  onToggleKeep: (id: number) => void;
}

export function SinceDawnView({ rows, status, onToggleKeep }: SinceDawnViewProps) {
  const [visible, setVisible] = useState(PAGE);
  // Rows present at first load stay still; a track that arrives later slides in.
  const [initialIds, setInitialIds] = useState<Set<number> | null>(null);
  if (initialIds === null && rows.length > 0) setInitialIds(new Set(rows.map((r) => r.id)));
  const shown = rows.slice(0, visible);

  return (
    <section
      id="depuis-l-aube"
      aria-labelledby="since-dawn-title"
      className="grid scroll-mt-10 gap-6 md:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] md:gap-16"
    >
      <div className="reveal-heading flex flex-col gap-2 self-start md:sticky md:top-10 md:gap-3">
        <h2 id="since-dawn-title" className="text-section m-0">
          {m.since_dawn_title()}
        </h2>
        <p className="text-intro text-text-muted max-w-blurb m-0">{m.since_dawn_body()}</p>
      </div>

      <div className="flex flex-col">
        {status === 'loading' && rows.length === 0 ? (
          <ol aria-busy="true" className="border-accent m-0 list-none border-t p-0">
            {Array.from({ length: 6 }, (_, i) => (
              <li key={i} className="border-border flex min-h-16 items-center border-b">
                <span className="bg-surface-raised h-4 w-2/3 rounded-sm" />
              </li>
            ))}
          </ol>
        ) : rows.length === 0 ? (
          <p className="text-text-muted border-accent m-0 border-t pt-4">
            {status === 'error' ? m.since_dawn_error() : m.since_dawn_empty()}
          </p>
        ) : (
          <ol className="border-accent m-0 list-none border-t p-0">
            {shown.map((row) => (
              <li
                key={row.id}
                className={cn(
                  'border-border ease-out-soft hover:bg-accent/3 grid min-h-16 grid-cols-[3.75rem_2.75rem_minmax(0,1fr)_2.75rem] items-center gap-x-3 border-b py-2 transition-colors duration-300 md:px-1 lg:min-h-15 lg:grid-cols-[4.5rem_2.75rem_minmax(0,1.2fr)_minmax(0,1fr)_2.75rem] lg:gap-x-6',
                  initialIds !== null && !initialIds.has(row.id) ? 'thread-in' : 'reveal'
                )}
              >
                <span
                  className={cn(
                    'text-ui font-mono whitespace-nowrap tabular-nums',
                    row.isNow ? 'text-text' : 'text-text-muted font-normal'
                  )}
                >
                  {row.isNow ? (
                    <>
                      <span aria-hidden="true" className="motion-safe:animate-live">
                        ●{' '}
                      </span>
                      <span className="sr-only">{m.on_air_sr()} </span>
                    </>
                  ) : null}
                  {formatClock(row.playedAt)}
                </span>
                <Cover
                  src={row.art}
                  alt=""
                  seed={`${row.artist}|${row.title}`}
                  className="size-11"
                />
                <span className="flex min-w-0 flex-col lg:contents">
                  <span className="text-row truncate lg:self-center">{row.title}</span>
                  {row.artistHref ? (
                    // Negative margins grow the tap target to 44px without moving the row.
                    <Link
                      to={row.artistHref}
                      className={cn(
                        ARTIST_LINK,
                        'text-sub text-text-muted -my-3 truncate py-3 underline-offset-4 lg:self-center'
                      )}
                    >
                      {row.artist}
                    </Link>
                  ) : (
                    <span className="text-sub text-text-muted truncate lg:self-center">
                      {row.artist}
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => onToggleKeep(row.id)}
                  disabled={row.isKeeping}
                  aria-pressed={row.isKept}
                  aria-label={m.track_keep_aria({ title: row.title })}
                  className="group ease-out-quart focus-visible:outline-accent flex size-11 items-center justify-center rounded-full transition-[scale] duration-150 focus-visible:outline-2 active:scale-90 disabled:opacity-50"
                >
                  <KeepHeart
                    isKept={row.isKept}
                    className="ease-spring size-4.5 transition-transform duration-250 group-hover:scale-118"
                    strokeWidth={1.5}
                  />
                </button>
              </li>
            ))}
          </ol>
        )}

        {rows.length > visible ? (
          <button
            type="button"
            onClick={() => setVisible((v) => v + PAGE)}
            className={cn(TEXT_ACTION, 'mt-5 self-start md:ml-33 lg:ml-42')}
          >
            {m.since_dawn_more()}
          </button>
        ) : null}
      </div>
    </section>
  );
}

export function SinceDawn() {
  const { entries, isLoading, error } = useTodayHistory();
  const nowId = useNowPlayingStore((s) => s.data?.now_playing?.sh_id);
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
      art: e.song.art,
      isNow: e.sh_id === nowId,
      isKept: isTrackLiked(tracks, e.song.title, e.song.artist),
      isKeeping: likingTrackId === `${e.song.title}-${e.song.artist}`,
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
    />
  );
}
