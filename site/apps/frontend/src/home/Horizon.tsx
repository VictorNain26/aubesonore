import { usePlayer } from '../lib/player';
import { HorizonLine } from './HorizonLine';

export interface HorizonViewProps {
  isPlaying: boolean;
}

/**
 * The horizon at the foot of the hero, under the player, in the dawn: the line is the sound of the
 * live stream and the dot on the right is now. Its height follows the screen's (--horizon-height,
 * design/tokens.css, hero), so it holds in the first screen of a phone on its side. The dot keeps
 * to the page's edge, at the middle of the line's band; the line runs on to the left edge of the
 * screen.
 */
export function HorizonView({ isPlaying }: HorizonViewProps) {
  return (
    <div data-horizon className="px-page relative h-(--horizon-height)">
      {/* The dawn rises behind the line, held to its row and faded toward its top: never under
          the actions above (the dawn is never under text). */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 overflow-hidden mask-t-from-50%"
      >
        <div className="dawn-band dawn-arrive" />
      </div>
      <div className="relative size-full">
        <div className="draw-in bleed-left absolute right-3 bottom-0 h-5/6 mask-r-from-75% md:right-14 md:mask-r-from-80%">
          <HorizonLine isPlaying={isPlaying} className="size-full" />
        </div>
        <span
          aria-hidden="true"
          className="from-accent/0 to-accent absolute right-4 bottom-5/12 hidden h-px w-35 bg-linear-to-r md:block"
        />
        <span
          aria-hidden="true"
          className="now-arrive bass-beat bg-accent absolute -right-1 bottom-5/12 size-3 translate-y-1/2 rounded-full md:right-2"
        />
      </div>
    </div>
  );
}

export function Horizon() {
  const isPlaying = usePlayer((s) => s.isPlaying);
  return <HorizonView isPlaying={isPlaying} />;
}
