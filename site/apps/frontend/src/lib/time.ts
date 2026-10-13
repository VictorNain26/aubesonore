import { getLocale } from '@/paraglide/runtime.js';

/** 24-hour clock time ("17:01") of a Unix timestamp in seconds. */
export function formatClock(unixSeconds: number): string {
  return new Intl.DateTimeFormat(getLocale(), {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(unixSeconds * 1000);
}

/** Whether a Unix timestamp in seconds falls on the same local day as `now`. */
export function isToday(unixSeconds: number, now: Date = new Date()): boolean {
  const date = new Date(unixSeconds * 1000);
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}
