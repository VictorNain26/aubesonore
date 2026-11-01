import { Link } from 'react-router';
import { cn } from '@/lib/utils';
import { ARTIST_LINK } from './classes';
import * as m from '@/paraglide/messages.js';

/** The album as the antenna names it, or null: a single's album is its own title, said twice. */
export function shownAlbum(album: string, title: string): string | null {
  const name = album.trim();
  return name && name.localeCompare(title.trim(), undefined, { sensitivity: 'accent' }) !== 0
    ? name
    : null;
}

/**
 * The live's one dot, 7 px in the dawn's ink, beside the words that say the live (« En direct »,
 * the player bar's track). Still: the one that beats is the horizon's, now on the line.
 */
export function LiveDot() {
  return <span aria-hidden="true" className="bg-dawn-ink size-1.75 shrink-0 rounded-full" />;
}

/** « En direct » above the track on air, in the hero and the phone's sheet. */
export function LiveMark({ className }: { className?: string }) {
  return (
    <p className={cn('text-body m-0 flex items-center gap-2 font-semibold', className)}>
      <LiveDot />
      {m.now_live()}
    </p>
  );
}

/**
 * The artist of the track on air, a link to their page once it exists, then its album, muted:
 * under the title in the hero and the phone's sheet.
 */
export function TrackCredit({
  artist,
  album,
  title,
  artistHref,
  className,
}: {
  artist: string;
  album: string;
  title: string;
  artistHref: string | null;
  className?: string;
}) {
  const shown = shownAlbum(album, title);
  return (
    <p className={cn('text-line m-0', className)}>
      {/* Inline padding grows the tap target to 44px without moving the line. */}
      {artistHref ? (
        <Link to={artistHref} className={cn(ARTIST_LINK, 'py-3 underline-offset-5')}>
          {artist}
        </Link>
      ) : (
        artist
      )}
      {shown ? (
        <span className="text-text-muted">
          {' · '}
          <cite className="not-italic">{shown}</cite>
        </span>
      ) : null}
    </p>
  );
}
