import { useState, type CSSProperties } from 'react';
import { Dialog } from '@base-ui/react/dialog';
import { X } from 'lucide-react';
import type { ArtistImage } from '@aubesonore/shared-types/client';
import * as m from '@/paraglide/messages.js';
import { cn } from '@/lib/utils';
import { artworkSrcSet } from '../lib/artwork';
import { ARTIST_LINK, CLOSE_BUTTON } from '../home/styles';

const OUTSIDE_LINK = { rel: 'noopener noreferrer', target: '_blank' } as const;

function hash(seed: string): number {
  let h = 5381;
  for (let i = 0; i < seed.length; i += 1) h = (h * 33) ^ seed.charCodeAt(i);
  return Math.abs(h);
}

/**
 * Where an artist's dawn rises (`artist-dawn`, tokens.css): placed by its id,
 * so the same artist always gets the same one and two artists rarely the same.
 */
export function dawnOf(seed: string): CSSProperties {
  const h = hash(seed);
  return {
    '--sun': `${30 + (h % 41)}%`,
    '--rose': `${12 + ((h >> 6) % 30)}%`,
    '--lilac': `${58 + ((h >> 12) % 30)}%`,
    '--rise': `${26 + ((h >> 18) % 14)}%`,
  } as CSSProperties;
}

/** The image as the large view shows it: Commons' 1280 px photo, the cover at 1200 px. */
function largeOf(image: ArtistImage): string {
  return image.kind === 'cover' ? image.url.replace(/\/front-500$/, '/front-1200') : image.url;
}

const CREDIT_LINK = cn(ARTIST_LINK, 'text-text-muted underline-offset-4');

/** Under the large image: the credit a photo's licence asks for, or the cover's record. */
function Caption({ image }: { image: ArtistImage }) {
  if (image.kind === 'cover') {
    return (
      <p className="text-ui text-text-muted m-0">
        {image.year
          ? m.artist_cover_caption({ title: image.title, year: String(image.year) })
          : image.title}
      </p>
    );
  }
  const { credit } = image;
  return (
    <p className="text-ui text-text-muted m-0">
      <a href={credit.source} {...OUTSIDE_LINK} className={CREDIT_LINK}>
        {credit.author ? m.artist_photo_by({ author: credit.author }) : m.artist_photo()}
      </a>
      {', '}
      {credit.licenceUrl ? (
        <a href={credit.licenceUrl} {...OUTSIDE_LINK} className={CREDIT_LINK}>
          {credit.licence}
        </a>
      ) : (
        credit.licence
      )}
    </p>
  );
}

export interface ArtistPortraitProps {
  image: ArtistImage | null;
  name: string;
  /** What places the artist's dawn: its MBID, else its name. */
  seed: string;
  className?: string;
  sizes?: string;
}

/**
 * The artist's image, opening large on a click, where a photo's credit stands
 * (docs/vision.md §2.5); a small © on the photo says it has one. Without an
 * image, or when it fails to load, the artist's dawn.
 */
export function ArtistPortrait({ image, name, seed, className, sizes }: ArtistPortraitProps) {
  const [failed, setFailed] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const usable = image && image.url !== failed ? image : null;

  if (!usable) {
    return (
      <div
        aria-hidden="true"
        data-testid="artist-dawn"
        className={cn('artist-dawn rounded-sm', className)}
        style={dawnOf(seed)}
      />
    );
  }

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger
        aria-label={m.artist_image_open({ name })}
        className={cn(
          // The covers' hover: one style for every image of the site (Releases, MostKept).
          'bg-surface-raised ease-out-soft hover:shadow-lift focus-visible:outline-accent relative block cursor-zoom-in overflow-hidden rounded-sm p-0 transition-[translate,box-shadow] duration-500 focus-visible:outline-2 focus-visible:outline-offset-4 motion-safe:hover:-translate-y-1.5',
          className
        )}
      >
        <img
          src={usable.url}
          srcSet={sizes ? artworkSrcSet(usable.url) : undefined}
          sizes={sizes}
          alt=""
          referrerPolicy="no-referrer"
          decoding="async"
          fetchPriority="high"
          className="size-full object-cover"
          onError={() => setFailed(usable.url)}
        />
        {usable.kind === 'photo' ? (
          <span
            aria-hidden="true"
            className="bg-surface text-text-muted text-label absolute right-2 bottom-2 inline-flex size-6 items-center justify-center rounded-full font-mono"
          >
            ©
          </span>
        ) : null}
      </Dialog.Trigger>
      <Dialog.Portal>
        {/* The site's windows (Modal): the veil and the paper fade in, the paper from 95 %. */}
        <Dialog.Backdrop className="bg-scrim ease-out-quart fixed inset-0 z-50 transition-opacity duration-300 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <Dialog.Popup className="bg-surface border-border ease-out-soft fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col gap-3 rounded-md border p-3 transition-[opacity,scale] duration-300 focus-visible:outline-none data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0 md:p-4">
          <Dialog.Title className="sr-only">{name}</Dialog.Title>
          <img
            src={largeOf(usable)}
            alt={m.artist_portrait_alt({ name })}
            referrerPolicy="no-referrer"
            className="max-h-[calc(100dvh-9rem)] max-w-full min-w-0 rounded-sm object-contain"
          />
          <div className="flex items-center justify-between gap-4 pl-1">
            <Caption image={usable} />
            <Dialog.Close aria-label={m.close()} className={CLOSE_BUTTON}>
              <X className="size-4.5" strokeWidth={1.8} aria-hidden="true" />
            </Dialog.Close>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
