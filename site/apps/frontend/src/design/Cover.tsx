import { useCallback, useState } from 'react';
import { cn } from '@/lib/utils';
import { isDefaultArtwork } from '../lib/azuracast';
import { CoverGlyph } from './CoverGlyph';
import { artworkSrc, artworkSrcSet } from '../lib/artwork';

export interface CoverProps {
  src: string | null | undefined;
  alt: string;
  /** Seed of the fallback glyph shown when there is no usable artwork. */
  seed: string;
  className?: string;
  priority?: boolean;
  /**
   * The width the cover is laid out at, as the `sizes` attribute: where its host resizes, the
   * browser downloads the smallest file that fills it on this screen.
   */
  sizes?: string;
  /** Told when the image does not load, after the glyph takes its place. */
  onError?: () => void;
}

export function Cover({ src, alt, seed, className, priority = false, sizes, onError }: CoverProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const usable = !isDefaultArtwork(src) && src !== failedSrc;
  const { watch, fadeClass, onLoad } = useFadeIn(!priority);

  return (
    <div
      className={cn('bg-surface-raised overflow-hidden rounded-sm', className)}
      // alt="" marks the cover as decoration: its fallback glyph must not be
      // announced either, or a link around it reads "Pochette indisponible".
      aria-hidden={!usable && alt === '' ? true : undefined}
    >
      {usable ? (
        <img
          ref={watch}
          src={src ? artworkSrc(src) : undefined}
          srcSet={src && sizes ? artworkSrcSet(src) : undefined}
          sizes={sizes}
          alt={alt}
          referrerPolicy="no-referrer"
          decoding="async"
          loading={priority ? 'eager' : 'lazy'}
          fetchPriority={priority ? 'high' : 'auto'}
          className={cn('size-full object-cover', fadeClass)}
          onLoad={onLoad}
          onError={() => {
            setFailedSrc(src ?? null);
            onError?.();
          }}
        />
      ) : (
        <CoverGlyph seed={seed} size="md" className="size-full" />
      )}
    </div>
  );
}

/**
 * A cover that arrives after the page fades in rather than drops in. Only when it mounts still
 * loading: the server's render shows it at once (an image is never hidden before the script
 * runs), and a cover whose source changes keeps showing the old one until the new arrives. Off for
 * a priority image, which the server already drew (the hero, the portrait). Under
 * prefers-reduced-motion it simply appears.
 */
function useFadeIn(enabled = true) {
  const [waiting, setWaiting] = useState(false);
  // A callback ref, the same function every time: React calls it once, when the image mounts.
  const watch = useCallback(
    (image: HTMLImageElement | null) => {
      if (enabled && image && !image.complete) setWaiting(true);
    },
    [enabled]
  );
  return {
    watch,
    fadeClass: cn(
      'motion-safe:ease-out-quart motion-safe:transition-opacity motion-safe:duration-300',
      waiting && 'opacity-0'
    ),
    onLoad: () => setWaiting(false),
  };
}
