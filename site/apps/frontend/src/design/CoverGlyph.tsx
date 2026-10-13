import { cn } from '@/lib/utils';

const SIZE: Record<'sm' | 'md', string> = {
  sm: 'size-10',
  md: 'size-12',
};

const TINTS = ['bg-glyph-1', 'bg-glyph-2', 'bg-glyph-3', 'bg-glyph-4'];

function hash(seed: string): number {
  let h = 5381;
  for (let i = 0; i < seed.length; i += 1) {
    h = (h * 33) ^ seed.charCodeAt(i);
  }
  return Math.abs(h);
}

export interface CoverGlyphProps {
  /** Chaîne source du hash déterministe (ex. `${artist}|${title}`). */
  seed: string;
  /** Taille du carré : `sm` (40px) ou `md` (48px). */
  size?: 'sm' | 'md';
  className?: string;
}

/**
 * Visuel de repli déterministe pour une pochette absente : teinte + onde
 * statique dérivées d'un hash du `seed`, sans animation.
 */
export function CoverGlyph({ seed, size = 'sm', className }: CoverGlyphProps) {
  const index = hash(seed) % TINTS.length;
  const tint = TINTS[index];

  return (
    <div
      className={cn(SIZE[size], tint, 'relative shrink-0 overflow-hidden rounded-sm', className)}
      role="img"
      aria-label="Pochette indisponible"
    >
      <svg
        viewBox="0 0 48 48"
        className="text-accent/25 absolute inset-0 size-full"
        aria-hidden="true"
      >
        <path d="M0 30 Q12 22 24 30 T48 30" fill="none" stroke="currentColor" strokeWidth="2" />
        <path
          d="M0 36 Q12 30 24 36 T48 36"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          opacity="0.7"
        />
        <path
          d="M0 24 Q12 18 24 24 T48 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          opacity="0.5"
        />
      </svg>
    </div>
  );
}
