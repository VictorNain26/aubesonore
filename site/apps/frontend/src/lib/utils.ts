import { type ClassValue, clsx } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// tailwind-merge only knows Tailwind's default scale: without this, a custom
// size like `text-line` is read as a color and dropped next to `text-on-accent`.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ['name', 'page', 'title', 'heading', 'line', 'body', 'small', 'mark'],
      shadow: ['cover'],
    },
  },
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
