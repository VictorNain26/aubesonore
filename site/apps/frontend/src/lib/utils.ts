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
        'page',
        'now',
        'mark',
        'section',
        'headline',
        'intro',
        'row',
        'sub',
        'ui',
      ],
      shadow: ['cover'],
    },
  },
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
