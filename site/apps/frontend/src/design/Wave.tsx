import type { ReactNode } from 'react';
import { LAYERS, wavePath, type WaveOptions } from './wave';

export interface WaveProps extends Pick<WaveOptions, 'amplitude' | 'seed' | 'envelope'> {
  /** The drawing's own units: the SVG stretches to its box, the stroke keeps its width. */
  width?: number;
  height: number;
  /** The full trace alone, or with its echo. */
  traces?: 1 | 2;
  /** A short segment travels along the full trace (the loader). */
  travel?: boolean;
  /** Drawn under the line (a missing cover's sun). */
  children?: ReactNode;
  className?: string;
}

/** The line, still, in the ink's colour (currentColor): decoration, hidden from assistive tech. */
export function Wave({
  width = 1000,
  height,
  amplitude,
  seed,
  envelope,
  traces = 1,
  travel = false,
  children,
  className,
}: WaveProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={className}
    >
      {children}
      {LAYERS.slice(0, traces)
        .map((layer, i) => (
          <path
            key={i}
            d={wavePath({ width, height, amplitude, seed, envelope, layer: i })}
            fill="none"
            stroke="currentColor"
            strokeOpacity={layer.alpha}
            strokeWidth={layer.width}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
            pathLength={travel && i === 0 ? 1 : undefined}
            className={travel && i === 0 ? 'line-travel' : undefined}
          />
        ))
        // The echo under the full trace.
        .reverse()}
    </svg>
  );
}
