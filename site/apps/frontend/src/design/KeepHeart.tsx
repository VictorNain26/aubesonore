import { useState } from 'react';
import { Heart } from 'lucide-react';
import { cn } from '@/lib/utils';

interface KeepHeartProps {
  isKept: boolean;
  className?: string;
  strokeWidth?: number;
}

/** The Garder heart: filled when kept, and it beats once at the moment it is kept, never on load. */
export function KeepHeart({ isKept, className, strokeWidth = 1.6 }: KeepHeartProps) {
  const [wasKept, setWasKept] = useState(isKept);
  const [justKept, setJustKept] = useState(false);
  if (isKept !== wasKept) {
    setWasKept(isKept);
    setJustKept(isKept);
  }

  return (
    <Heart
      className={cn(className, isKept && 'fill-current', justKept && 'keep-pop')}
      strokeWidth={strokeWidth}
      aria-hidden="true"
    />
  );
}
