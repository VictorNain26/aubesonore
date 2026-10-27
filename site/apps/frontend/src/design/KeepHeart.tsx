import { useState } from 'react';
import { cn } from '@/lib/utils';
import { HeartIcon } from './icons';

interface KeepHeartProps {
  isKept: boolean;
  className?: string;
}

/** The Garder heart: filled when kept, and it beats once at the moment it is kept, never on load. */
export function KeepHeart({ isKept, className }: KeepHeartProps) {
  const [wasKept, setWasKept] = useState(isKept);
  const [justKept, setJustKept] = useState(false);
  if (isKept !== wasKept) {
    setWasKept(isKept);
    setJustKept(isKept);
  }

  return <HeartIcon filled={isKept} className={cn(className, justKept && 'keep-pop')} />;
}
