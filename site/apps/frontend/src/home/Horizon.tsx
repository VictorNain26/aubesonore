import { usePlayer } from '../lib/player';
import { HorizonLine } from './HorizonLine';
import * as m from '@/paraglide/messages.js';

export interface HorizonViewProps {
  isPlaying: boolean;
}

/**
 * The horizon at the foot of the dawn: the line is the sound of the live
 * stream, and what the radio is sits on it. The tagline keeps to the page's
 * edge; the line runs on to the left edge of the screen and fades out on the right.
 */
export function HorizonView({ isPlaying }: HorizonViewProps) {
  return (
    <div data-horizon className="px-page relative mt-8 h-40 md:h-48 lg:mt-auto">
      <div className="relative size-full">
        <div className="draw-in bleed-left absolute right-0 bottom-0 h-20 mask-r-from-75% md:h-30 md:mask-r-from-80%">
          <HorizonLine isPlaying={isPlaying} className="size-full" />
        </div>
        <p className="text-intro text-text-muted max-w-blurb absolute bottom-17 left-0 m-0 text-balance md:bottom-22">
          {m.hero_tagline()}
        </p>
      </div>
    </div>
  );
}

export function Horizon() {
  const isPlaying = usePlayer((s) => s.isPlaying);
  return <HorizonView isPlaying={isPlaying} />;
}
