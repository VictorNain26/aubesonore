import { SiteHeader } from '../shell/SiteHeader';
import { ErrorBoundary } from 'react-error-boundary';
import { NowPlaying, NowPlayingFallback } from './NowPlaying';
import { Horizon } from './Horizon';
import * as m from '@/paraglide/messages.js';

/**
 * The opening screen: the welcome in one quiet line (the page's one heading: it names the page
 * and holds still, where the title on air changes every few minutes), then the player, the
 * biggest thing on the page; right under it the horizon, the line that carries the live sound,
 * with the dawn light rising along it.
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

      <div className="px-page relative z-10 flex flex-1 flex-col justify-center gap-6 pt-5 md:gap-10 md:pt-12">
        <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
          <h1 className="font-display text-title m-0 font-normal italic">{m.hero_title()}</h1>
          <p className="text-intro text-text-muted m-0 text-pretty">{m.hero_tagline()}</p>
        </div>
        <ErrorBoundary FallbackComponent={NowPlayingFallback}>
          <NowPlaying />
        </ErrorBoundary>
      </div>

      <Horizon />
    </div>
  );
}
