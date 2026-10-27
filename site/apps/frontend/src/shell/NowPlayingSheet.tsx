import { Drawer } from '@base-ui/react/drawer';
import { CloseIcon, ShareIcon } from '../design/icons';
import { cn } from '@/lib/utils';
import type { Diffusion } from '../hooks/useDiffusion';
import { CastControl } from './CastControl';
import { Cover } from '../design/Cover';
import { CoverLight } from '../design/CoverLight';
import { KeepButton } from '../design/KeepButton';
import { LiveMark, TrackCredit } from '../design/onAir';
import { CLOSE_BUTTON, KEEP_RING, TEXT_ACTION } from '../design/classes';
import { ListenPill, type ListenState } from '../home/listen';
import * as m from '@/paraglide/messages.js';

export interface NowPlayingSheetProps {
  track: { title: string; artist: string; album: string; art: string | undefined };
  artistHref: string | null;
  listen: ListenState;
  onToggleListen: () => void;
  isKept: boolean;
  onToggleKeep: () => void;
  onShare: () => void;
  diffusion: Diffusion | null;
  /** The bar's track line, which opens the sheet. */
  children: React.ReactNode;
}

/**
 * The track on air, whole, on a phone: a tap on the bar's track line raises a sheet lit by the
 * cover on air as the hero is, with the large cover, « En direct », the full title, the artist (a
 * link to their page) and its album, the Écouter pill with Garder's ring beside it, then Partager
 * and Diffuser, as the hero has them.
 * It closes by a swipe down, a tap outside, Escape or its close button, top right as in the Menu.
 * Base UI's Drawer brings the gesture, the focus trap and iOS's quirks; the motion is its
 * bottom-sheet example's.
 */
export function NowPlayingSheet({
  track,
  artistHref,
  listen,
  onToggleListen,
  isKept,
  onToggleKeep,
  onShare,
  diffusion,
  children,
}: NowPlayingSheetProps) {
  return (
    <Drawer.Root>
      <Drawer.Trigger
        aria-label={m.sheet_open({ title: track.title, artist: track.artist })}
        className="ease-out-quart focus-visible:outline-on-accent flex min-w-0 flex-1 items-center gap-3 rounded-full py-1 pr-2 text-left transition-opacity duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 active:opacity-60"
      >
        {children}
      </Drawer.Trigger>
      <Drawer.Portal>
        <Drawer.Backdrop className="sheet-backdrop bg-scrim fixed inset-0 z-50 min-h-dvh" />
        <Drawer.Viewport className="fixed inset-0 z-50 flex items-end justify-center">
          <Drawer.Popup className="sheet-popup bg-surface text-text relative w-full px-6 pt-3 outline-none">
            <CoverLight art={track.art} />
            <span
              aria-hidden="true"
              className="bg-border relative mx-auto mb-6 block h-1 w-10 rounded-full"
            />
            <Drawer.Close
              aria-label={m.close()}
              className={cn(CLOSE_BUTTON, 'absolute top-2 right-3')}
            >
              <CloseIcon className="size-4.5" />
            </Drawer.Close>
            <Drawer.Content className="relative mx-auto flex w-full max-w-sm flex-col">
              <Cover
                src={track.art}
                alt=""
                seed={`${track.artist}|${track.title}`}
                // At most a third of the screen's height: on a 360×640 phone the whole sheet,
                // down to its actions, then holds without scrolling.
                className="shadow-cover mb-5 aspect-square w-[min(100%,36svh)] self-center"
              />
              <LiveMark className="mb-1" />
              <Drawer.Title className="font-display text-section m-0 text-balance">
                {track.title}
              </Drawer.Title>
              <TrackCredit
                artist={track.artist}
                album={track.album}
                title={track.title}
                artistHref={artistHref}
                className="mt-1.5"
              />
              <div className="mt-6 flex flex-col gap-2">
                <span className="flex items-center gap-3">
                  <ListenPill listen={listen} onToggle={onToggleListen} className="flex-1" />
                  <KeepButton
                    title={track.title}
                    isKept={isKept}
                    onToggle={onToggleKeep}
                    className={KEEP_RING}
                    heartClassName="size-6"
                  />
                </span>
                <span className="flex flex-wrap items-center gap-x-6">
                  <button type="button" onClick={onShare} className={TEXT_ACTION}>
                    <ShareIcon className="size-4" />
                    {m.track_share()}
                  </button>
                  {diffusion ? <CastControl diffusion={diffusion} variant="text" /> : null}
                </span>
              </div>
            </Drawer.Content>
          </Drawer.Popup>
        </Drawer.Viewport>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
