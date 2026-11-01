import { env } from '../../config/env';

/**
 * The site's lockup as an image, for the pages and mails the backend draws: by day and by night,
 * made by apps/frontend/brand/build.py (LOCKUP_HEIGHT, drawn at 3×) and served by the site. Its
 * name is its alt text.
 */
export const LOCKUP = {
  day: `${env.FRONTEND_BASE_URL}/lockup.png`,
  night: `${env.FRONTEND_BASE_URL}/lockup-night.png`,
  width: 186,
  height: 22,
  alt: 'AubeSonore',
} as const;
