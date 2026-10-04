import { type ClassValue, clsx } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// tailwind-merge only knows Tailwind's default scale: without this, a custom
// size like `text-ui` is read as a color and dropped next to `text-on-accent`.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: [
        'title',
        'body',
        'caption',
        'hero',
        'logo',
        'mark',
        'section',
        'headline',
        'intro',
        'row',
        'sub',
        'ui',
        'label',
      ],
      'font-weight': ['display', 'heading'],
      shadow: ['cover', 'lift', 'bar'],
      animate: ['breathe', 'pulse-now'],
    },
  },
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
