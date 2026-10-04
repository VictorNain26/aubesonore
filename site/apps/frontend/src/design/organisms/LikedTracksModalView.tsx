import { ChevronDown, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getLocale } from '@/paraglide/runtime.js';
import { Modal } from './Modal';
import { Menu } from '../molecules/Menu';
import { Cover } from '../../home/Cover';
import type { AlertState } from '../../lib/push';
import * as m from '@/paraglide/messages.js';

interface LikedTrackViewModel {
  id: string;
  title: string;
  artist: string;
  artworkUrl?: string;
  /** ISO date the track was kept. */
  keptAt: string;
  /** Direct platform link, or `null` while links are still resolving; `isPreferred`
   *  is false when the track is not on the chosen platform and opens elsewhere. */
  link: { href: string; platform: string; isPreferred: boolean } | null;
  /** Row is pending removal (grayed, showing Undo). */
  pendingRemoval: boolean;
  /** Remaining share of the removal grace period (1 → 0), drives the countdown bar. */
  removalFraction?: number;
}

interface PlatformOption {
  id: string;
  name: string;
}

export interface LikedTracksModalViewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  alert: { state: AlertState | null; isBusy: boolean; onToggle: () => void };
  totalCount: number;
  isLoading: boolean;
  tracks: LikedTrackViewModel[];
  hiddenCount: number;
  onShowMore: () => void;
  platforms: readonly PlatformOption[];
  selectedPlatformId: string;
  onSelectPlatform: (platformId: string) => void;
  onDeleteTrack: (id: string) => void;
  onUndoTrack: (id: string) => void;
}

const ICON_ACTION =
  'ease-out-quart focus-visible:outline-accent flex size-11 items-center justify-center rounded-full transition-[opacity,scale] duration-150 hover:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-90';

// One formatter per locale: building one per row costs ~0.5 ms each, and a
// library holds up to 500 rows.
const keptOnFormats = new Map<string, Intl.DateTimeFormat>();

function keptOn(iso: string): string {
  const locale = getLocale();
  let format = keptOnFormats.get(locale);
  if (!format) {
    format = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long' });
    keptOnFormats.set(locale, format);
  }
  return m.library_kept_on({ date: format.format(new Date(iso)) });
}

function AlertSwitch({ alert }: Pick<LikedTracksModalViewProps, 'alert'>) {
  const isOn = alert.state === 'on';
  const blocked = alert.state === 'unsupported' || alert.state === 'denied';
  return (
    <div className="border-border flex flex-col gap-2 border-b px-6 py-4.5 md:px-8">
      <div className="flex items-center justify-between gap-4">
        <span className="flex flex-col">
          <span className="font-semibold">{m.alert_title()}</span>
          <span className="text-ui text-text-muted font-normal">{m.alert_body()}</span>
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={isOn}
          aria-label={m.alert_aria()}
          onClick={alert.onToggle}
          disabled={alert.state === null || alert.isBusy || blocked}
          className={cn(
            'ease-out-quart focus-visible:outline-accent flex h-8 w-13 shrink-0 rounded-full p-0.75 transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50',
            isOn ? 'bg-accent justify-end' : 'bg-border justify-start'
          )}
        >
          <span className="bg-surface size-6.5 rounded-full" />
        </button>
      </div>
      {blocked ? (
        <p className="text-caption text-text-muted m-0">
          {alert.state === 'denied' ? m.alert_denied() : m.alert_unsupported()}
        </p>
      ) : null}
    </div>
  );
}

/**
 * "Mes titres": the alert switch, the preferred
 * platform, and every kept track with a link to open it there. The container
 * owns the stores, link resolution, the removal timer and the push subscription.
 */
export function LikedTracksModalView({
  open,
  onOpenChange,
  alert,
  totalCount,
  isLoading,
  tracks,
  hiddenCount,
  onShowMore,
  platforms,
  selectedPlatformId,
  onSelectPlatform,
  onDeleteTrack,
  onUndoTrack,
}: LikedTracksModalViewProps) {
  const platformName = platforms.find((p) => p.id === selectedPlatformId)?.name ?? '';

  return (
    <Modal
      title={m.library_modal_title()}
      open={open}
      onOpenChange={onOpenChange}
      variant="drawer"
      {...(totalCount > 0
        ? {
            eyebrow:
              totalCount > 1 ? m.library_count_other({ count: totalCount }) : m.library_count_one(),
          }
        : {})}
    >
      <AlertSwitch alert={alert} />

      {totalCount > 0 ? (
        <div className="border-border text-ui text-text-muted flex items-center justify-between border-b px-6 py-1.5 font-normal md:px-8">
          <span>{m.library_open_with()}</span>
          {platforms.length < 2 ? (
            <span className="text-text flex min-h-11 items-center font-semibold">
              {platformName}
            </span>
          ) : (
            <Menu
              trigger={
                <button
                  type="button"
                  aria-label={m.library_platform_picker()}
                  className="text-text focus-visible:outline-accent flex min-h-11 items-center gap-1.5 rounded-sm font-semibold focus-visible:outline-2 [&[data-popup-open]>svg]:rotate-180"
                >
                  {platformName}
                  <ChevronDown className="ease-out-quart size-3.5 transition-transform duration-150" />
                </button>
              }
              items={platforms.map((platform) => ({
                label: platform.name,
                onSelect: () => onSelectPlatform(platform.id),
                selected: platform.id === selectedPlatformId,
              }))}
            />
          )}
        </div>
      ) : null}

      {isLoading ? (
        <ul aria-busy="true" className="m-0 list-none px-6 md:px-8">
          {Array.from({ length: 4 }, (_, i) => (
            <li key={i} className="border-border flex items-center gap-4 border-b py-3.5">
              <span className="bg-surface-raised size-16 rounded-sm" />
              <span className="bg-surface-raised h-4 w-1/2 rounded-sm" />
            </li>
          ))}
        </ul>
      ) : totalCount === 0 ? (
        <div className="flex flex-col gap-1 px-6 py-10 md:px-8">
          <p className="text-row m-0">{m.library_empty_title()}</p>
          <p className="text-text-muted m-0">{m.library_empty_body()}</p>
        </div>
      ) : (
        <ul className="m-0 list-none px-6 md:px-8">
          {tracks.map((track) => (
            <li
              key={track.id}
              className={cn(
                'border-border grid grid-cols-[4rem_minmax(0,1fr)_2.75rem_auto] items-center gap-x-3 border-b py-3.5 md:gap-x-4',
                track.pendingRemoval && 'opacity-60'
              )}
            >
              <Cover
                src={track.artworkUrl}
                alt=""
                seed={`${track.artist}|${track.title}`}
                className={cn('size-16', track.pendingRemoval && 'grayscale')}
              />
              <span className="flex min-w-0 flex-col">
                <span className={cn('text-row truncate', track.pendingRemoval && 'line-through')}>
                  {track.title}
                </span>
                <span className="text-text-muted truncate">{track.artist}</span>
                <span className="text-caption text-text-muted mt-0.5 font-normal">
                  {track.pendingRemoval ? m.liked_track_removed() : keptOn(track.keptAt)}
                  {!track.pendingRemoval && track.link && !track.link.isPreferred
                    ? ` · ${m.library_only_on({ platform: track.link.platform })}`
                    : null}
                </span>
                {track.pendingRemoval ? (
                  <span
                    role="progressbar"
                    aria-label={m.liked_track_removal_countdown()}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round((track.removalFraction ?? 1) * 100)}
                    className="bg-border mt-2 h-0.5 overflow-hidden rounded-full"
                  >
                    <span
                      className="bg-accent block h-full transition-[width] duration-250 ease-linear"
                      style={{ width: `${(track.removalFraction ?? 1) * 100}%` }}
                    />
                  </span>
                ) : null}
              </span>
              {track.pendingRemoval ? (
                <button
                  type="button"
                  onClick={() => onUndoTrack(track.id)}
                  className="text-ui focus-visible:outline-accent col-span-2 min-h-11 rounded-sm underline decoration-1 underline-offset-4 hover:decoration-2 focus-visible:outline-2"
                >
                  {m.liked_track_undo()}
                </button>
              ) : (
                <>
                  {track.link ? (
                    <a
                      href={track.link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={m.library_open_on({
                        title: track.title,
                        platform: track.link.platform,
                      })}
                      title={m.library_open_on({
                        title: track.title,
                        platform: track.link.platform,
                      })}
                      className={ICON_ACTION}
                    >
                      <ExternalLink className="size-4.5" strokeWidth={1.6} aria-hidden="true" />
                    </a>
                  ) : (
                    <span
                      role="img"
                      aria-label={m.library_links_resolving({ title: track.title })}
                      title={m.library_links_resolving({ title: track.title })}
                      className={cn(ICON_ACTION, 'cursor-help opacity-40')}
                    >
                      <ExternalLink className="size-4.5" strokeWidth={1.6} aria-hidden="true" />
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => onDeleteTrack(track.id)}
                    aria-label={m.track_unkeep_aria({ title: track.title })}
                    className="text-ui text-text-muted ease-out-quart hover:text-text focus-visible:outline-accent min-h-11 rounded-sm px-1 font-normal transition-[color,scale] duration-150 focus-visible:outline-2 active:scale-97"
                  >
                    {m.library_remove()}
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {hiddenCount > 0 ? (
        <button
          type="button"
          onClick={onShowMore}
          className="text-ui focus-visible:outline-accent mx-6 my-5 min-h-11 self-start rounded-sm underline decoration-1 underline-offset-4 hover:decoration-2 focus-visible:outline-2 md:mx-8"
        >
          {m.library_show_more({ count: hiddenCount })}
        </button>
      ) : null}
    </Modal>
  );
}
