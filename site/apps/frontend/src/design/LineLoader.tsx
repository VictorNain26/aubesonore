import { cn } from '@/lib/utils';
import * as m from '@/paraglide/messages.js';
import { Wave } from './Wave';

/**
 * Something is on its way: a short segment of the line travels along it (`line-travel`), still
 * under reduced motion. The host gives it the room of what it waits for, so nothing moves when
 * that arrives.
 */
export function LineLoader({ className }: { className?: string }) {
  return (
    <div role="progressbar" aria-label={m.loading()} className={cn('flex items-center', className)}>
      <Wave height={24} amplitude={6} seed={1.7} travel className="text-text h-6 w-40" />
    </div>
  );
}
