import { useEffect, useRef, useState } from 'react';
import { isDefaultArtwork } from '../lib/azuracast';
import { artworkAt } from '../lib/artwork';
import { readInks } from './lightInks';
import { lightOpacity } from './lightStrength';

/** The light is the cover at its smallest: 2.4 KB for the station's art. */
const LIGHT_PIXELS = 96;
/**
 * The cross-fade of two lights (design/tokens.css, light-in and light-out): the next fades in as
 * the last fades out, then the last goes, already gone from view.
 */
export const LIGHT_FADE_MS = 1000;
/** The canvas the light is painted into, then drawn at the hero's size as an image. */
const CANVAS_PIXELS = 32;
/** At 32 px, 1.5 px of blur: about 90 px once drawn over a large screen; the mockup's colours. */
const PAINT_FILTER = 'blur(1.5px) saturate(1.35)';
/**
 * The canvas's part the hero shows (it is drawn at 130% × 150% from -15%, -25%: tokens.css,
 * cover-light), the words' ground: the hero from 1.25% to 98.75% of its width, inside its gutters,
 * and from its top to its foot, the header's name, line and links included.
 */
const SHOWN = { x: 4, y: 5, width: 24, height: 22 } as const;
/** The depth in the hero (0 at its top, 1 at its foot) of the centre of a row of SHOWN. */
const depthOfRow = (row: number) => ((SHOWN.y + row + 0.5) / CANVAS_PIXELS) * 1.5 - 0.25;
/** A cover as dark and as light as any: what a cover whose pixels cannot be read is dimmed for. */
const WORST_PIXELS = new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255]);
/** Apple's CDN answers CORS (`Access-Control-Allow-Origin: *`): its pixels can be read. */
const READABLE_ELSEWHERE = /^https:\/\/is\d+-ssl\.mzstatic\.com\//;

interface Layers {
  /** The light shown. */
  shown: string | null;
  /** The next track's, fading in over it once its file has come. */
  next: string | null;
  nextLoaded: boolean;
  /** A next light whose file could not be had: never asked again, the one shown fading out. */
  missing: string | null;
}

/**
 * The cover on air as the hero's light, blurred behind it under a veil of the paper
 * (design/tokens.css, cover-light), dimmed for a cover its words would not read on. When the
 * track changes, the next light fades in as the last fades out, once its file has come, then the
 * last goes: two at most, the one shown and the newest. The first fades in with the cover. A next
 * light whose file cannot be had leaves none: the last fades out, it is not this track's.
 * Decoration: hidden from screen readers.
 */
export function CoverLightView({ art }: { art: string | null | undefined }) {
  const src = art && !isDefaultArtwork(art) ? artworkAt(art, LIGHT_PIXELS) : null;
  const [layers, setLayers] = useState<Layers>({
    shown: src,
    next: null,
    nextLoaded: false,
    missing: null,
  });
  // The page's first light fades in with the cover (light-first); the next ones cross-fade.
  const [firstSrc] = useState(src);
  const newest = layers.next ?? layers.missing ?? layers.shown;
  if (src !== newest) {
    setLayers((prev) =>
      src === null
        ? { shown: null, next: null, nextLoaded: false, missing: null }
        : // A next light still loading gives way to the newer: the one shown holds meanwhile
          // (unless it was already fading out for a missing one).
          {
            shown: prev.nextLoaded ? prev.next : prev.missing ? null : prev.shown,
            next: src,
            nextLoaded: false,
            missing: null,
          }
    );
  }

  useEffect(() => {
    if (!layers.nextLoaded) return;
    const timer = setTimeout(
      () => setLayers((prev) => ({ ...prev, shown: prev.next, next: null, nextLoaded: false })),
      LIGHT_FADE_MS
    );
    return () => clearTimeout(timer);
  }, [layers.nextLoaded, layers.next]);

  const fading = layers.missing !== null && layers.shown !== null;
  useEffect(() => {
    if (!fading) return;
    const timer = setTimeout(() => setLayers((prev) => ({ ...prev, shown: null })), LIGHT_FADE_MS);
    return () => clearTimeout(timer);
  }, [fading]);

  return (
    <div aria-hidden="true" className="cover-light">
      {layers.shown ? (
        <Light
          key={layers.shown}
          src={layers.shown}
          className={
            layers.nextLoaded || layers.missing
              ? 'light-out'
              : layers.shown === firstSrc
                ? 'light-first'
                : undefined
          }
        />
      ) : null}
      {layers.next ? (
        <Light
          key={layers.next}
          src={layers.next}
          className={layers.nextLoaded ? 'light-in' : 'invisible'}
          onLoad={() => setLayers((prev) => ({ ...prev, nextLoaded: true }))}
          onError={() =>
            setLayers((prev) => ({ ...prev, next: null, nextLoaded: false, missing: prev.next }))
          }
        />
      ) : null}
    </div>
  );
}

/** The cover, blurred and its colours raised, into the canvas, past its edges so none fades. */
function paint(canvas: HTMLCanvasElement | null, image: HTMLImageElement) {
  const context = canvas?.getContext('2d', { willReadFrequently: true });
  if (!canvas || !context) return;
  // Where the canvas knows no filter (Safari before 18), the 32 px cover drawn large is soft.
  context.filter = PAINT_FILTER;
  context.drawImage(image, -4, -4, CANVAS_PIXELS + 8, CANVAS_PIXELS + 8);
  weigh(canvas, context);
}

/**
 * The light's opacity for its cover: the whole light, unless the words over it would fall under
 * AA, then just enough less (home/lightStrength.ts). A cover of another origin that does not
 * answer CORS cannot be read: it is dimmed as the worst cover would be.
 */
function weigh(canvas: HTMLCanvasElement, context: CanvasRenderingContext2D) {
  const inks = readInks(canvas);
  if (!inks) return;
  let opacity: number;
  try {
    const pixels = context.getImageData(SHOWN.x, SHOWN.y, SHOWN.width, SHOWN.height).data;
    opacity = lightOpacity(pixels, inks, (index) => depthOfRow(Math.floor(index / SHOWN.width)));
  } catch {
    opacity = lightOpacity(WORST_PIXELS, inks);
  }
  canvas.style.opacity = String(opacity);
}

/**
 * One light: its file, loaded unseen, painted once into a small canvas. A file that came before
 * the script ran (the server's page) is painted as the canvas mounts.
 */
function Light({
  src,
  className,
  onLoad,
  onError,
}: {
  src: string;
  className?: string | undefined;
  onLoad?: () => void;
  onError?: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const file = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const image = file.current;
    if (image?.complete && image.naturalWidth > 0) paint(canvas.current, image);
    // The words change ink from day to night: the light is weighed again for them.
    const scheme = window.matchMedia?.('(prefers-color-scheme: dark)');
    const reweigh = () => {
      const element = canvas.current;
      const context = element?.getContext('2d', { willReadFrequently: true });
      if (element && context && file.current?.naturalWidth) weigh(element, context);
    };
    scheme?.addEventListener('change', reweigh);
    return () => scheme?.removeEventListener('change', reweigh);
  }, []);
  return (
    <>
      <img
        ref={file}
        src={src}
        alt=""
        hidden
        crossOrigin={READABLE_ELSEWHERE.test(src) ? 'anonymous' : undefined}
        referrerPolicy="no-referrer"
        decoding="async"
        fetchPriority="low"
        onLoad={(event) => {
          paint(canvas.current, event.currentTarget);
          onLoad?.();
        }}
        onError={onError}
      />
      <canvas
        ref={canvas}
        data-testid="cover-light"
        width={CANVAS_PIXELS}
        height={CANVAS_PIXELS}
        className={className}
      />
    </>
  );
}

/** The light of the cover the hero shows; none off air (home/Hero.tsx). */
export function CoverLight({ art }: { art: string | null | undefined }) {
  return <CoverLightView art={art} />;
}
