import { useEffect, useRef, useState } from 'react';
import { isDefaultArtwork, useNowPlayingStore } from '../lib/azuracast';
import { artworkAt } from '../lib/artwork';

/** The light is the cover at its smallest: 2.4 KB for the station's art. */
const LIGHT_PIXELS = 96;
/** The next light's fade (design/tokens.css, light-in), after which the last one goes. */
export const LIGHT_FADE_MS = 1400;
/** The canvas the light is painted into, then drawn at the hero's size as an image. */
const CANVAS_PIXELS = 32;
/** At 32 px, 1.5 px of blur: about 90 px once drawn over a large screen. */
const PAINT_FILTER = 'blur(1.5px) saturate(2.5)';

interface Layers {
  /** The light shown. */
  shown: string | null;
  /** The next track's, fading in over it once its file has come. */
  next: string | null;
  nextLoaded: boolean;
}

/**
 * The cover on air as the hero's light, blurred behind it under a tone and a veil of the paper
 * (design/tokens.css, cover-light). When the track changes, the next light fades in over the last
 * once its file has come, then the last goes: two at most, the one shown and the newest. The first
 * comes without a fade. Decoration: hidden from screen readers.
 */
export function CoverLightView({ art }: { art: string | null | undefined }) {
  const src = art && !isDefaultArtwork(art) ? artworkAt(art, LIGHT_PIXELS) : null;
  const [layers, setLayers] = useState<Layers>({ shown: src, next: null, nextLoaded: false });
  const newest = layers.next ?? layers.shown;
  if (src !== newest) {
    setLayers((prev) =>
      src === null
        ? { shown: null, next: null, nextLoaded: false }
        : // A next light still loading gives way to the newer: the one shown holds meanwhile.
          { shown: prev.nextLoaded ? prev.next : prev.shown, next: src, nextLoaded: false }
    );
  }

  useEffect(() => {
    if (!layers.nextLoaded) return;
    const timer = setTimeout(
      () => setLayers((prev) => ({ shown: prev.next, next: null, nextLoaded: false })),
      LIGHT_FADE_MS
    );
    return () => clearTimeout(timer);
  }, [layers.nextLoaded, layers.next]);

  return (
    <div aria-hidden="true" className="cover-light">
      {layers.shown ? <Light key={layers.shown} src={layers.shown} /> : null}
      {layers.next ? (
        <Light
          key={layers.next}
          src={layers.next}
          className={layers.nextLoaded ? 'light-in' : 'invisible'}
          onLoad={() => setLayers((prev) => ({ ...prev, nextLoaded: true }))}
        />
      ) : null}
    </div>
  );
}

/** The cover, blurred and its colours raised, into the canvas, past its edges so none fades. */
function paint(canvas: HTMLCanvasElement | null, image: HTMLImageElement) {
  const context = canvas?.getContext('2d');
  if (!context) return;
  // Where the canvas knows no filter (Safari before 18), the 32 px cover drawn large is soft.
  context.filter = PAINT_FILTER;
  context.drawImage(image, -4, -4, CANVAS_PIXELS + 8, CANVAS_PIXELS + 8);
}

/**
 * One light: its file, loaded unseen, painted once into a small canvas. A file that came before
 * the script ran (the server's page) is painted as the canvas mounts.
 */
function Light({
  src,
  className,
  onLoad,
}: {
  src: string;
  className?: string;
  onLoad?: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const file = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const image = file.current;
    if (image?.complete && image.naturalWidth > 0) paint(canvas.current, image);
  }, []);
  return (
    <>
      <img
        ref={file}
        src={src}
        alt=""
        hidden
        referrerPolicy="no-referrer"
        decoding="async"
        fetchPriority="low"
        onLoad={(event) => {
          paint(canvas.current, event.currentTarget);
          onLoad?.();
        }}
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

export function CoverLight() {
  const art = useNowPlayingStore((s) => s.data?.now_playing?.song.art);
  return <CoverLightView art={art} />;
}
