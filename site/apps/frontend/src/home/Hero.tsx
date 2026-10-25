import { useEffect, useRef } from 'react';
import { SiteHeader } from '../shell/SiteHeader';
import { ErrorBoundary } from 'react-error-boundary';
import { NowPlaying, NowPlayingFallback } from './NowPlaying';
import { Horizon } from './Horizon';
import { CoverLight } from './CoverLight';
import { SinceDawn } from './SinceDawn';
import type { SongEntry } from '../lib/azuracast';
import type { Loaded } from '../lib/homeData';
import { useHeroPlayerStore } from '../stores/heroPlayerStore';
import * as m from '@/paraglide/messages.js';

/**
 * The opening screen (design/tokens.css, hero), lit by the cover on air (CoverLight): the player,
 * the biggest thing on the page, and the thread of the last tracks, beside it on a large screen,
 * under it on a phone; at its foot the horizon, the line that carries the live sound, where the
 * light ends. The page's one heading, the welcome, is for screen readers: it names the page and
 * holds still, where the title on air changes every few minutes. While its player is on screen
 * the player bar stays away (stores/heroPlayerStore.ts).
 */
export function Hero({ history }: { history: Loaded<SongEntry[]> | null }) {
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
      <CoverLight />
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

      <h1 className="sr-only">{m.hero_title()}</h1>

      <div className="px-page hero-main relative z-10">
        <div ref={player} className="player-room">
          <ErrorBoundary FallbackComponent={NowPlayingFallback}>
            <NowPlaying />
          </ErrorBoundary>
        </div>
        <SinceDawn history={history} />
      </div>

      <Horizon />
    </div>
  );
}
