import { useEffect, useId, useState } from 'react';
import { cn } from '@/lib/utils';

// Module state outlives a page change: the mark rises once per visit, not at every navigation.
// The pre-render never runs effects, so every pre-rendered page carries the entrance.
let hasRisen = false;

/**
 * The mark of brand/logo.svg: the sun rising behind the horizon line, its light on the water.
 * On the first page of a visit the line draws, the sun rises behind it, then its reflection
 * draws; still when motion is reduced.
 */
export function LogoMark({ className }: { className?: string }) {
  const [rises] = useState(() => !hasRisen);
  const sky = useId();
  useEffect(() => {
    hasRisen = true;
  }, []);

  return (
    <svg viewBox="24 32 464 464" aria-hidden="true" className={cn('shrink-0', className)}>
      <clipPath id={sky}>
        <path d="M0 292 C 64 252, 128 332, 192 292 S 320 252, 384 292 S 470 316, 512 292 V 0 H 0 Z" />
      </clipPath>
      <g clipPath={`url(#${sky})`}>
        <circle cx="256" cy="292" r="168" className={cn('fill-dawn', rises && 'logo-rise')} />
      </g>
      <path
        d="M40 292 C 88 262, 144 322, 192 292 S 320 262, 384 292 S 446 312, 472 292"
        pathLength={1}
        fill="none"
        strokeWidth={26}
        strokeLinecap="round"
        className={cn('stroke-current', rises && 'logo-draw')}
      />
      <path
        d="M96 380 C 140 356, 192 404, 240 380 S 352 356, 416 380"
        pathLength={1}
        fill="none"
        strokeWidth={26}
        strokeLinecap="round"
        className={cn('stroke-dawn', rises && 'logo-reflect')}
      />
    </svg>
  );
}
