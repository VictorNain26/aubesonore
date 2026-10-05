import { useState } from 'react';
import { cn } from '@/lib/utils';
import { isDefaultArtwork } from '../lib/azuracast';
import { CoverGlyph } from '../design/atoms/CoverGlyph';
import { artworkSrcSet } from '../lib/artwork';

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
}

export function Cover({ src, alt, seed, className, priority = false, sizes }: CoverProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const usable = !isDefaultArtwork(src) && src !== failedSrc;

  return (
    <div
      className={cn('bg-surface-raised overflow-hidden rounded-sm', className)}
      // alt="" marks the cover as decoration: its fallback glyph must not be
      // announced either, or a link around it reads "Pochette indisponible".
      aria-hidden={!usable && alt === '' ? true : undefined}
    >
      {usable ? (
        <img
          src={src ?? undefined}
          srcSet={src && sizes ? artworkSrcSet(src) : undefined}
          sizes={sizes}
          alt={alt}
          referrerPolicy="no-referrer"
          decoding="async"
          loading={priority ? 'eager' : 'lazy'}
          fetchPriority={priority ? 'high' : 'auto'}
          className="size-full object-cover"
          onError={() => setFailedSrc(src ?? null)}
        />
      ) : (
        <CoverGlyph seed={seed} size="md" className="size-full" />
      )}
    </div>
  );
}
