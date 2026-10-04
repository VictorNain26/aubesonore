import { Drawer } from '@base-ui/react/drawer';
import { Link } from 'react-router';
import { Airplay } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Cover } from './Cover';
import { KeepHeart } from './KeepHeart';
import { ARTIST_LINK, TEXT_ACTION } from './styles';
import { LISTEN_PILL, ListenDisc, listenAria, listenLabel, type ListenState } from './listen';
import * as m from '@/paraglide/messages.js';

export interface NowPlayingSheetProps {
  track: { title: string; artist: string; album: string; art: string | undefined };
  artistHref: string | null;
  listen: ListenState;
  onToggleListen: () => void;
  isKept: boolean;
  onToggleKeep: () => void;
  airPlay: { isActive: boolean; onOpen: () => void } | null;
  /** The bar's track line, which opens the sheet. */
  children: React.ReactNode;
}

/**
 * The track on air, whole, on a phone: a tap on the bar's track line raises a sheet with the large
 * cover, the full title, the artist (a link to their page), the album, Écouter, Garder and AirPlay.
 * It closes by a swipe down, a tap outside, Escape or Fermer. Base UI's Drawer brings the gesture,
 * the focus trap and iOS's quirks; the motion is its bottom-sheet example's.
 */
export function NowPlayingSheet({
  track,
  artistHref,
  listen,
  onToggleListen,
  isKept,
  onToggleKeep,
  airPlay,
  children,
}: NowPlayingSheetProps) {
  const album = track.album.trim();
  const showAlbum =
    album !== '' &&
    album.localeCompare(track.title.trim(), undefined, { sensitivity: 'accent' }) !== 0;

  return (
    <Drawer.Root>
      <Drawer.Trigger
        aria-label={m.sheet_open({ title: track.title, artist: track.artist })}
        className="ease-out-quart focus-visible:outline-on-accent flex min-w-0 flex-1 items-center gap-3 rounded-full py-1 pr-2 text-left transition-opacity duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 active:opacity-60"
      >
        {children}
      </Drawer.Trigger>
      <Drawer.Portal>
        <Drawer.Backdrop className="sheet-backdrop bg-accent fixed inset-0 min-h-dvh" />
        <Drawer.Viewport className="fixed inset-0 flex items-end justify-center">
          <Drawer.Popup className="sheet-popup bg-surface text-text shadow-lift w-full rounded-t-md px-6 pt-3 outline-none">
            <span
              aria-hidden="true"
              className="bg-border mx-auto mb-6 block h-1 w-10 rounded-full"
            />
            <Drawer.Content className="mx-auto flex w-full max-w-sm flex-col gap-2">
              <Cover
                src={track.art}
                alt=""
                seed={`${track.artist}|${track.title}`}
                className="shadow-cover mb-4 aspect-square w-full"
              />
              <Drawer.Title className="text-section m-0 text-balance">{track.title}</Drawer.Title>
              <p className="text-headline text-text-muted m-0 font-normal">
                {artistHref ? (
                  <Link to={artistHref} className={cn(ARTIST_LINK, 'py-3 underline-offset-6')}>
                    {track.artist}
                  </Link>
                ) : (
                  track.artist
                )}
              </p>
              {showAlbum ? (
                <p className="text-sub text-text-muted m-0">
                  {m.now_album_from()} <cite>{album}</cite>
                </p>
              ) : null}
              <div className="mt-6 flex flex-col gap-3">
                <button
                  type="button"
                  onClick={onToggleListen}
                  aria-label={listenAria(listen)}
                  aria-busy={listen === 'connecting'}
                  className={LISTEN_PILL}
                >
                  <ListenDisc state={listen} className="size-11" />
                  <span className="text-ui font-semibold">{listenLabel(listen)}</span>
                </button>
                <span className="flex flex-wrap items-center gap-x-5">
                  <button
                    type="button"
                    onClick={onToggleKeep}
                    aria-pressed={isKept}
                    className={TEXT_ACTION}
                  >
                    <KeepHeart isKept={isKept} className="size-4" />
                    {m.track_keep()}
                  </button>
                  {airPlay ? (
                    <button
                      type="button"
                      onClick={airPlay.onOpen}
                      aria-pressed={airPlay.isActive}
                      className={TEXT_ACTION}
                    >
                      <Airplay className="size-4" aria-hidden="true" />
                      {airPlay.isActive ? m.airplay_active() : m.airplay_open()}
                    </button>
                  ) : null}
                  <Drawer.Close className={cn(TEXT_ACTION, 'ml-auto')}>{m.close()}</Drawer.Close>
                </span>
              </div>
            </Drawer.Content>
          </Drawer.Popup>
        </Drawer.Viewport>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
