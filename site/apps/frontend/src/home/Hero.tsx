import { SiteHeader } from './SiteHeader';
import { ErrorBoundary } from 'react-error-boundary';
import { NowPlaying, NowPlayingFallback } from './NowPlaying';
import { Horizon } from './Horizon';

/**
 * The opening screen: the promise in a line, then what plays now, biggest,
 * with Écouter under it; the dawn light rises along the horizon, the line that
 * carries the live sound.
 */
export function Hero() {
  return (
    <div className="hero-height relative flex flex-col overflow-hidden">
      <div aria-hidden="true" className="dawn-band dawn-arrive" />
      <svg
        aria-hidden="true"
        className="grain-fade pointer-events-none absolute inset-0 size-full opacity-13 mix-blend-multiply"
      >
        <filter id="grain">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.85"
            numOctaves="3"
            stitchTiles="stitch"
          />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#grain)" />
      </svg>

      <SiteHeader />

      <div className="px-page relative z-10 flex flex-1 items-center pt-6 md:pt-12">
        <ErrorBoundary FallbackComponent={NowPlayingFallback}>
          <NowPlaying />
        </ErrorBoundary>
      </div>

      <Horizon />
    </div>
  );
}
