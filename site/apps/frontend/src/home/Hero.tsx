import { useEffect, useRef } from 'react';
import { SiteHeader } from '../shell/SiteHeader';
import { ErrorBoundary } from 'react-error-boundary';
import { NowPlaying, NowPlayingFallback } from './NowPlaying';
import { Horizon } from './Horizon';
import { useHeroPlayerStore } from '../stores/heroPlayerStore';
import * as m from '@/paraglide/messages.js';

/**
 * The opening screen, the first screen whole (design/tokens.css, hero): the welcome in one quiet
 * sentence (the page's one heading: it names the page and holds still, where the title on air
 * changes every few minutes), then the player, the biggest thing on
 * the page, its cover taking the room left; at its foot the horizon, the line that carries the live
 * sound, with the dawn light rising along it. While its player is on screen the player bar stays
 * away (stores/heroPlayerStore.ts).
 */
export function Hero() {
  const player = useRef<HTMLDivElement>(null);
  const setInView = useHeroPlayerStore((s) => s.setInView);

  useEffect(() => {
    const element = player.current;
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) =>
      setInView(entry?.isIntersecting ?? true)
    );
    observer.observe(element);
    return () => {
      observer.disconnect();
      // The next page with a player of its own starts with the bar away, as it is drawn.
      setInView(true);
    };
  }, [setInView]);

  return (
    <div className="hero relative overflow-hidden">
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

      <h1 className="px-page font-display text-title relative z-10 m-0 font-normal italic">
        {m.hero_title()}
      </h1>

      <div ref={player} className="px-page player-room relative z-10">
        <ErrorBoundary FallbackComponent={NowPlayingFallback}>
          <NowPlaying />
        </ErrorBoundary>
      </div>

      <Horizon />
    </div>
  );
}
