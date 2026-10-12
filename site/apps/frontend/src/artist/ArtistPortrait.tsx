import { useState, type CSSProperties } from 'react';
import type { ArtistImage } from '@aubesonore/shared-types/client';
import * as m from '@/paraglide/messages.js';
import { cn } from '@/lib/utils';
import { artworkSrc, artworkSrcSet } from '../lib/artwork';
import { ARTIST_LINK } from '../home/styles';
import { OpenLarge } from '../design/organisms/OpenLarge';

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

/** A photo's own size, a cover's square; none when Commons gave no size. */
function sizeOf(image: ArtistImage): Size | null {
  if (image.kind === 'cover') return SQUARE;
  return image.width && image.height ? { width: image.width, height: image.height } : null;
}

/** At its own shape, as wide as its room and no taller than its cap (`portrait-room`). */
function shapeOf({ width, height }: Size): CSSProperties {
  return {
    aspectRatio: `${width} / ${height}`,
    width: `min(100%, var(--portrait-cap) * ${width} / ${height})`,
  };
}

export interface ArtistPortraitProps {
  /** The images to try, the first first (ArtistProfile.images). */
  images: readonly ArtistImage[];
  name: string;
  /** What places the artist's dawn: its MBID, else its name. */
  seed: string;
  sizes?: string;
}

/**
 * The artist's image at its own shape, never cut, inside a `portrait-room`; opening large on a
 * click, where a photo's credit stands (docs/vision.md §2.5); a small © on the photo says it has
 * one. An image that fails to load gives way to the next; past the last, the artist's dawn.
 */
export function ArtistPortrait({ images, name, seed, sizes }: ArtistPortraitProps) {
  const [failed, setFailed] = useState<readonly string[]>([]);
  const usable = images.find((image) => !failed.includes(image.url)) ?? null;

  if (!usable) {
    return (
      <div
        aria-hidden="true"
        data-testid="artist-dawn"
        className="artist-dawn rounded-sm"
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
      className="bg-surface-raised relative overflow-hidden"
      style={shapeOf(size ?? SQUARE)}
    >
      <img
        src={artworkSrc(usable.url)}
        srcSet={sizes ? artworkSrcSet(usable.url) : undefined}
        sizes={sizes}
        alt=""
        referrerPolicy="no-referrer"
        decoding="async"
        fetchPriority="high"
        // Its own shape, where it is known; else whole inside a square.
        className={cn('size-full', size === null ? 'object-contain' : 'object-cover')}
        onError={() => setFailed((before) => [...before, usable.url])}
      />
      {usable.kind === 'photo' ? (
        <span
          aria-hidden="true"
          className="bg-surface text-text-muted text-label absolute right-2 bottom-2 inline-flex size-6 items-center justify-center rounded-full font-mono"
        >
          ©
        </span>
      ) : null}
    </OpenLarge>
  );
}
