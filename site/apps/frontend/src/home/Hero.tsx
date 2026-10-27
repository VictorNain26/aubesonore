import { useEffect, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { ErrorBoundary } from 'react-error-boundary';
import type { TrendsResult } from '@aubesonore/shared-types/client';
import { SiteHeader } from '../shell/SiteHeader';
import { NowPlaying, NowPlayingFallback, preloadCover } from './NowPlaying';
import { useTrackSwap } from './useTrackSwap';
import { useNowPlayingStore, type SongEntry } from '../lib/azuracast';
import { JustBefore } from './JustBefore';
import { MostKept } from './MostKept';
import { Horizon } from './Horizon';
import { CoverLight } from './CoverLight';
import type { Loaded } from '../lib/homeData';
import { useHeroPlayerStore } from '../stores/heroPlayerStore';

/**
 * The opening screen, « la colonne » (design/tokens.css, hero): the header on the paper, with the
 * station's line beside the name as the page's one heading; the cover on air, square, from under
 * the header to the foot of the screen on a computer, edge to edge on a phone, nothing ever
 * written over it; beside it, a column spread over the height: the track on air with Écouter, the
 * track just before, the week's most kept; the horizon, the line of the live sound, at the foot.
 * On a phone the hero ends at the horizon after « Juste avant », the week right under it. The
 * column is lit by the cover on air (CoverLight). While Écouter is on screen the player bar stays
 * away (stores/heroPlayerStore.ts).
 */
export function Hero({ trends }: { trends: Loaded<TrendsResult> | null }) {
  // Écouter's block, the track's or the fallback's: watched again when one replaces the other.
  const [player, setPlayer] = useState<HTMLDivElement | null>(null);
  const setInView = useHeroPlayerStore((s) => s.setInView);
  const { onAir, isOnline } = useNowPlayingStore(
    useShallow((s) => ({ onAir: s.data?.now_playing ?? null, isOnline: s.data?.is_online ?? true }))
  );
  // The track shown, one change at a time: the last leaves, the next comes once its cover is
  // ready; the cover, its words, « Juste avant » and the light follow it together.
  const { shown, swap } = useTrackSwap(onAir, preloadTrackCover);

  useEffect(() => {
    const element = player;
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
  }, [player, setInView]);

  return (
    <div className="hero">
      <div className="hero-screen">
        {/* Off air, no light: the cover stays, dimmed (design/tokens.css, hero-cover). */}
        <CoverLight art={isOnline ? shown?.song.art : null} />
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

        <div className="hero-header">
          <SiteHeader tagline />
        </div>

        {/* The player's blocks are the grid's (hero-cover, hero-live). */}
        <ErrorBoundary
          fallbackRender={(props) => <NowPlayingFallback {...props} liveRef={setPlayer} />}
        >
          <NowPlaying shown={shown} swap={swap} liveRef={setPlayer} />
        </ErrorBoundary>

        <JustBefore shown={shown} swap={swap} />

        <div className="hero-horizon">
          <Horizon />
        </div>
      </div>

      <MostKept trends={trends} />
    </div>
  );
}

const preloadTrackCover = (track: SongEntry) => preloadCover(track.song.art);
