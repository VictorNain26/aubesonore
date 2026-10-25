import { useEffect, useState } from 'react';
import { isDefaultArtwork, useNowPlayingStore } from '../lib/azuracast';
import { artworkAt } from '../lib/artwork';

/** The light is the cover at its smallest: 2.4 KB for the station's art. */
const LIGHT_PIXELS = 96;
/** The next light's fade (design/tokens.css, light-in), after which the last one goes. */
export const LIGHT_FADE_MS = 1400;

interface Layers {
  /** The light shown. */
  shown: string | null;
  /** The next track's, fading in over it once its file has come. */
  next: string | null;
  nextLoaded: boolean;
}

/**
 * The cover on air as the hero's light, blurred behind it under a veil of the paper (design/
 * tokens.css, cover-light). When the track changes, the next light fades in over the last once its
 * file has come, then the last goes: two at most, the one shown and the newest. The first is drawn
 * as it comes, pre-rendered with the page. Decoration: hidden from screen readers.
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

function Light({
  src,
  className,
  onLoad,
}: {
  src: string;
  className?: string;
  onLoad?: () => void;
}) {
  return (
    <img
      src={src}
      alt=""
      referrerPolicy="no-referrer"
      decoding="async"
      fetchPriority="low"
      className={className}
      onLoad={onLoad}
    />
  );
}

export function CoverLight() {
  const art = useNowPlayingStore((s) => s.data?.now_playing?.song.art);
  return <CoverLightView art={art} />;
}
