import { useState, type ReactNode } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { X } from 'lucide-react';
import * as m from '@/paraglide/messages.js';
import { cn } from '@/lib/utils';
import { CLOSE_BUTTON } from '../../home/styles';

export interface LargeImage {
  src: string;
  /** What shows when `src` does not load: the image already on the page. */
  fallback: string;
  alt: string;
  /** Its shape, so the view opens at it before the file arrives; a square when unknown. */
  width?: number | null;
  height?: number | null;
}

function Large({ image }: { image: LargeImage }) {
  const [failed, setFailed] = useState(false);
  const shape =
    image.width && image.height
      ? { width: image.width, height: image.height }
      : { width: 1200, height: 1200 };
  return (
    <img
      src={failed ? image.fallback : image.src}
      {...shape}
      alt={image.alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className="h-auto max-h-[calc(100dvh-9rem)] w-auto max-w-full min-w-0 rounded-sm object-contain"
    />
  );
}

export interface OpenLargeProps {
  /** The trigger's accessible name: what opens, and that it opens large. */
  label: string;
  /** The window's name, read by a screen reader as it opens. */
  title: string;
  large: LargeImage;
  /** Under the large image: what it is, and for a photo the credit its licence asks for. */
  caption: ReactNode;
  /** The trigger's own classes: its size where it holds the place of the image. */
  className?: string | undefined;
  /** The image as the page shows it. */
  children: ReactNode;
}

/**
 * An image that opens large on a click, with what it is under it: the site's windows (Modal), the
 * veil and the paper fading in, the paper from 95 %. One gesture for every image of the site
 * (the artist's portrait, the covers).
 */
export function OpenLarge({ label, title, large, caption, className, children }: OpenLargeProps) {
  return (
    <Dialog.Root>
      <Dialog.Trigger
        aria-label={label}
        className={cn(
          // The covers' hover, one for every image that opens: it lifts, and gives way under the press.
          'ease-out-soft hover:shadow-lift focus-visible:outline-accent block cursor-zoom-in rounded-sm p-0 transition-[translate,box-shadow,scale] duration-500 focus-visible:outline-2 focus-visible:outline-offset-4 active:scale-98 motion-safe:hover:-translate-y-1.5',
          className
        )}
      >
        {children}
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="bg-scrim ease-out-quart fixed inset-0 z-50 transition-opacity duration-300 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <Dialog.Popup className="bg-surface border-border ease-out-soft fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col gap-3 rounded-md border p-3 transition-[opacity,scale] duration-300 focus-visible:outline-none data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0 md:p-4">
          <Dialog.Title className="sr-only">{title}</Dialog.Title>
          <Large key={large.src} image={large} />
          <div className="flex items-center justify-between gap-4 pl-1">
            <div className="text-ui text-text-muted">{caption}</div>
            <Dialog.Close aria-label={m.close()} className={CLOSE_BUTTON}>
              <X className="size-4.5" strokeWidth={1.8} aria-hidden="true" />
            </Dialog.Close>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
