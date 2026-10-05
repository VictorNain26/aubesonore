import { useState } from 'react';
import { cn } from '@/lib/utils';
import { isDefaultArtwork } from '../lib/azuracast';
import { CoverGlyph } from '../design/atoms/CoverGlyph';
import { artworkAt } from '../lib/artwork';

export interface CoverProps {
  src: string | null | undefined;
  alt: string;
  /** Seed of the fallback glyph shown when there is no usable artwork. */
  seed: string;
  className?: string;
  priority?: boolean;
  /** Pixels of the image file, for a cover shown small: where the host resizes, fewer bytes. */
  size?: number;
}

export function Cover({ src, alt, seed, className, priority = false, size }: CoverProps) {
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
          src={src && size ? artworkAt(src, size) : (src ?? undefined)}
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
