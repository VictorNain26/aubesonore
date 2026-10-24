import { useEffect, useRef } from 'react';
import { SiteHeader } from '../shell/SiteHeader';
import { ErrorBoundary } from 'react-error-boundary';
import { NowPlaying, NowPlayingFallback } from './NowPlaying';
import { Horizon } from './Horizon';
import { useHeroPlayerStore } from '../stores/heroPlayerStore';
import * as m from '@/paraglide/messages.js';

/**
 * The opening screen, the first screen whole (design/tokens.css, hero): the welcome in one quiet
 * line (the page's one heading: it names the page and holds still, where the title on air changes
 * every few minutes; its first sentence alone on a phone), then the player, the biggest thing on
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

      <div className="px-page relative z-10 flex flex-wrap items-baseline gap-x-5 gap-y-1">
        <h1 className="font-display text-title m-0 font-normal italic">{m.hero_title()}</h1>
        <p className="text-intro text-text-muted phone:hidden m-0 text-pretty">
          {m.hero_tagline()}
        </p>
      </div>

      <div ref={player} className="px-page relative z-10 grid">
        <ErrorBoundary FallbackComponent={NowPlayingFallback}>
          <NowPlaying />
        </ErrorBoundary>
      </div>

      <Horizon />
    </div>
  );
}
