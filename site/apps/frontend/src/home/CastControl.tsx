import { useState } from 'react';
import { Popover } from '@base-ui/react/popover';
import { Cast } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Diffusion } from '../hooks/useDiffusion';
import { TEXT_ACTION } from './styles';
import * as m from '@/paraglide/messages.js';

const BAR =
  'ease-out-quart focus-visible:outline-on-accent flex h-11 min-w-11 shrink-0 items-center justify-center gap-2 rounded-full px-3 transition-[opacity,background-color,color] duration-150 hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2';

/**
 * Diffuser: one button for AirPlay (Safari) and Chromecast (Chrome), shown wherever the browser can
 * cast, as Google's checklist asks of the Cast button on every screen with playable content
 * (developers.google.com/cast/docs/design_checklist/cast-button). It opens the device picker; with
 * no device found, it says what to check instead of opening a picker with nothing in it.
 * Connecting, its waves pulse; connected, it fills and names the device.
 */
export function CastControl({
  diffusion,
  variant,
}: {
  diffusion: Diffusion;
  /** `bar`: the dark player bar, icon first. `text`: a text action on the page or the sheet. */
  variant: 'bar' | 'text';
}) {
  const [helpOpen, setHelpOpen] = useState(false);
  const { kind, found, device, connecting, onOpen } = diffusion;
  const connected = device !== null;
  const label = connected ? m.cast_on({ device }) : m.cast_label();

  const icon = (
    <Cast
      className={cn('size-4', connecting && 'motion-safe:animate-pulse')}
      strokeWidth={1.8}
      aria-hidden="true"
    />
  );

  return (
    <Popover.Root
      open={helpOpen}
      onOpenChange={(open) => {
        // A device is there, or the stream already plays on one: its picker, not the help.
        if (open && (found || connected)) {
          onOpen();
          return;
        }
        setHelpOpen(open);
      }}
    >
      <Popover.Trigger
        render={
          <button
            type="button"
            aria-label={connected ? m.cast_active({ device }) : m.cast_open()}
            aria-pressed={connected}
            aria-busy={connecting || undefined}
            className={
              variant === 'bar'
                ? cn(BAR, connected && 'bg-on-accent text-accent hover:opacity-90')
                : cn(TEXT_ACTION, connected && 'font-semibold')
            }
          >
            {icon}
            {/* The bar shows the word once there is room for it, the device always. */}
            <span className={cn(variant === 'bar' && !connected && 'sr-only md:not-sr-only')}>
              {label}
            </span>
          </button>
        }
      />
      <Popover.Portal>
        {/* 16 px from the screen's edges, the page's gutter (Base UI's default is 5). In the hero
            and the sheet it opens under the button, off the title; the bar sits at the bottom. */}
        <Popover.Positioner
          side={variant === 'bar' ? 'top' : 'bottom'}
          sideOffset={8}
          collisionPadding={16}
          className="z-60"
        >
          <Popover.Popup className="border-border bg-surface-raised text-text ease-out-quart flex w-[min(20rem,calc(100vw-2rem))] origin-(--transform-origin) flex-col gap-2 rounded-md border p-4 transition-[opacity,scale] duration-150 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0">
            <Popover.Title className="text-ui m-0 font-semibold">
              {m.cast_none_title()}
            </Popover.Title>
            <Popover.Description className="text-ui text-text-muted m-0">
              {m.cast_none_body()}
            </Popover.Description>
            <p className="text-caption text-text-muted m-0">
              {kind === 'chromecast' ? m.cast_none_chromecast() : m.cast_none_airplay()}
            </p>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
