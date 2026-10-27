import { useState, type CSSProperties } from 'react';
import type { ArtistImage } from '@aubesonore/shared-types/client';
import * as m from '@/paraglide/messages.js';
import { cn } from '@/lib/utils';
import { artworkSrc, artworkSrcSet } from '../lib/artwork';
import { ARTIST_LINK } from '../design/classes';
import { OpenLarge } from '../design/OpenLarge';
import { hashOf } from '../design/wave';

const OUTSIDE_LINK = { rel: 'noopener noreferrer', target: '_blank' } as const;

/**
 * Where an artist's dawn rises (`artist-dawn`, tokens.css): placed by its id,
 * so the same artist always gets the same one and two artists rarely the same.
 */
export function dawnOf(seed: string): CSSProperties {
  const h = hashOf(seed);
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
      <p className="m-0">
        {image.year
          ? m.artist_cover_caption({ title: image.title, year: String(image.year) })
          : image.title}
      </p>
    );
  }
  const { credit } = image;
  return (
    <p className="m-0">
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

/** What the image is, for a reader who cannot see it. */
function altOf(image: ArtistImage, name: string): string {
  return image.kind === 'cover'
    ? m.artist_cover_alt({ title: image.title })
    : m.artist_portrait_alt({ name });
}

interface Size {
  width: number;
  height: number;
}

const SQUARE: Size = { width: 1, height: 1 };

/** A photo's own size, as Commons gives it; a cover's is not known, nearly always square. */
function sizeOf(image: ArtistImage): Size | null {
  if (image.kind === 'cover') return null;
  return image.width && image.height ? { width: image.width, height: image.height } : null;
}

/** At its own shape, as wide as its room and no taller than its cap (`portrait-room`). */
function shapeOf({ width, height }: Size): CSSProperties {
  return {
    aspectRatio: `${width} / ${height}`,
    width: `min(100%, var(--portrait-cap) * ${width} / ${height})`,
  };
}

/**
 * How wide it is drawn in its square room (`portrait-room`, `artist-stage`): beside the column,
 * the screen's height less the header and the horizon, 42% of its width or 36 rem, whichever is
 * least; stacked, the line less the gutters. A tall image takes its ratio of that.
 */
function sizesOf({ width, height }: Size): string {
  const ratio = `${width} / ${height}`;
  const fit = (room: string) => `min(${room}, ${room} * ${ratio})`;
  return [
    `(min-width: 40rem) and (orientation: landscape) ${fit('min(100vh - 10rem, 42vw, 36rem)')}`,
    `(min-width: 48rem) ${fit('(100vw - 5rem)')}`,
    fit('(100vw - 3rem)'),
  ].join(', ');
}

export interface ArtistPortraitProps {
  /** The images to try, the first first (ArtistProfile.images). */
  images: readonly ArtistImage[];
  name: string;
  /** What places the artist's dawn: its MBID, else its name. */
  seed: string;
}

/**
 * The artist's image at its own shape, never cut, inside a `portrait-room`; opening large on a
 * click, where a photo's credit stands (docs/vision.md §2.5); a small © on the photo says it has
 * one. An image that fails to load gives way to the next; past the last, the artist's dawn.
 */
export function ArtistPortrait({ images, name, seed }: ArtistPortraitProps) {
  const [failed, setFailed] = useState<readonly string[]>([]);
  const usable = images.find((image) => !failed.includes(image.url)) ?? null;

  if (!usable) {
    return (
      <div
        aria-hidden="true"
        data-testid="artist-dawn"
        className="artist-dawn"
        style={{ ...shapeOf(SQUARE), ...dawnOf(seed) }}
      />
    );
  }

  const size = sizeOf(usable);

  return (
    <OpenLarge
      label={m.artist_image_open({ name })}
      title={name}
      large={{
        src: largeOf(usable),
        fallback: usable.url,
        alt: altOf(usable, name),
        ...(usable.kind === 'photo' ? { width: usable.width, height: usable.height } : {}),
      }}
      caption={<Caption image={usable} />}
      // No ground of its own: one would edge the image with a hairline at a fractional width,
      // and band a cover that is not quite square.
      className="relative overflow-hidden"
      style={shapeOf(size ?? SQUARE)}
    >
      <img
        src={artworkSrc(usable.url)}
        srcSet={artworkSrcSet(usable.url)}
        sizes={sizesOf(size ?? SQUARE)}
        alt=""
        referrerPolicy="no-referrer"
        decoding="async"
        fetchPriority="high"
        // At its own shape where it is known; else whole inside a square, never cut.
        className={cn('size-full', size === null ? 'object-contain' : 'object-cover')}
        onError={() => setFailed((before) => [...before, usable.url])}
      />
      {usable.kind === 'photo' ? (
        <span
          aria-hidden="true"
          className="bg-surface text-text-muted text-caption absolute right-2 bottom-2 inline-flex size-6 items-center justify-center"
        >
          ©
        </span>
      ) : null}
    </OpenLarge>
  );
}
