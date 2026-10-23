import { cn } from '@/lib/utils';
import { Wave } from './Wave';
import { hashOf, seedOf } from './wave';

export interface CoverGlyphProps {
  /** What the cover stands for (`${artist}|${title}`): the same track always gets the same one. */
  seed: string;
  className?: string;
}

/**
 * A missing cover: the paper, a sun in the dawn and one thin line, the site's line, drawn by the
 * track, so that two tracks rarely look alike. Still, never animated.
 */
export function CoverGlyph({ seed, className }: CoverGlyphProps) {
  const sunX = 14 + (hashOf(seed) % 23);

  return (
    <div
      className={cn('bg-surface-raised relative shrink-0 overflow-hidden', className)}
      role="img"
      aria-label="Pochette indisponible"
    >
      <Wave
        width={48}
        height={48}
        amplitude={7}
        seed={seedOf(seed)}
        className="text-text absolute inset-0 size-full"
      >
        <circle cx={sunX} cy={30} r={8} className="fill-dawn" stroke="none" />
      </Wave>
    </div>
  );
}
