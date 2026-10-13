import { useState, type ReactNode } from 'react';
import { isDefaultArtwork } from '../lib/azuracast';
import { artworkAt } from '../lib/artwork';
import { OpenLarge } from './OpenLarge';
import { Cover, type CoverProps } from './Cover';

const COVER_ART_ARCHIVE_SIZE = /\/front-(250|500)$/;

/**
 * A cover at the largest its host serves: the Cover Art Archive's 1200 px thumbnail, else 1000 px
 * where the host resizes (artwork.ts), else the cover as given.
 */
export function largeArtworkOf(src: string): string {
  return COVER_ART_ARCHIVE_SIZE.test(src)
    ? src.replace(COVER_ART_ARCHIVE_SIZE, '/front-1200')
    : artworkAt(src, 1000);
}

export interface CoverOpenLargeProps extends CoverProps {
  /** The trigger's name: what opens large. */
  label: string;
  /** The window's name. */
  title: string;
  /** What the large view says under it. */
  caption: ReactNode;
  largeAlt: string;
  /**
   * The place the cover takes in its layout, held by the trigger, or by a plain box when there is
   * nothing to open: the cover fills it either way.
   */
  triggerClassName?: string;
}

/** A cover that opens large on a click (OpenLarge); without a real image, the cover alone. */
export function CoverOpenLarge({
  label,
  title,
  caption,
  largeAlt,
  triggerClassName,
  ...cover
}: CoverOpenLargeProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const { src, seed } = cover;
  // Keyed by its seed, the cover replays its entrance for another track, while the window, and
  // the focus on its trigger, stay.
  if (!src || isDefaultArtwork(src) || src === failedSrc)
    return (
      <div className={triggerClassName}>
        <Cover key={seed} {...cover} src={src === failedSrc ? null : src} />
      </div>
    );
  return (
    <OpenLarge
      label={label}
      title={title}
      large={{ src: largeArtworkOf(src), fallback: src, alt: largeAlt }}
      caption={caption}
      className={triggerClassName}
    >
      <Cover key={seed} {...cover} onError={() => setFailedSrc(src)} />
    </OpenLarge>
  );
}
