import { type CSSProperties, useEffect, useId, useState } from 'react';
import { cn } from '@/lib/utils';
import { LOGO_ART } from './logoArt';

// Once per page load: a later page, or the menu, shows the logo at rest.
let introPlayed = false;

const [VIEW_X, , VIEW_WIDTH] = LOGO_ART.viewBox.split(' ').map(Number);

interface LogoProps {
  /** Plays the intro, the first time a logo asks for it on this page load. */
  intro?: boolean;
  className?: string;
}

/**
 * AubeSonore's lockup, the symbol and the word in one drawing (brand/README.md). Decorative: the
 * link or heading around it carries the name. Its ink is the text colour, its sun the dawn.
 *
 * The intro tells the mark: the horizon is drawn, the sun rises from behind it, and the letters
 * rise from the baseline one after another (tokens.css, `logo-intro`). The prerendered page
 * already carries the class, so it plays before the scripts load.
 */
export function Logo({ intro = false, className }: LogoProps) {
  const id = useId().replace(/[^\w-]/g, '');
  const [animated] = useState(() => intro && !introPlayed);

  useEffect(() => {
    if (animated) introPlayed = true;
  }, [animated]);

  return (
    <svg
      viewBox={LOGO_ART.viewBox}
      aria-hidden="true"
      focusable="false"
      className={cn('w-auto overflow-visible', animated && 'logo-intro', className)}
    >
      <defs>
        <clipPath id={`${id}-sky`}>
          <path d={LOGO_ART.sky} />
        </clipPath>
        <clipPath id={`${id}-base`}>
          <rect x={VIEW_X} y={-2000} width={VIEW_WIDTH} height={2000 + LOGO_ART.baseline} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${id}-sky)`}>
        <circle className="logo-sun" {...LOGO_ART.sun} />
      </g>
      <g className="logo-wave">
        <path
          className="logo-line"
          d={LOGO_ART.line}
          pathLength={1}
          strokeWidth={LOGO_ART.lineWidth}
        />
      </g>
      <g clipPath={`url(#${id}-base)`}>
        {LOGO_ART.letters.map((d, i) => (
          <path key={d} className="logo-letter" style={{ '--i': i } as CSSProperties} d={d} />
        ))}
      </g>
    </svg>
  );
}
