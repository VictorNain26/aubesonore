import { getLocale } from '@/paraglide/runtime.js';

/** 24-hour clock time ("17:01") of a Unix timestamp in seconds. */
export function formatClock(unixSeconds: number): string {
  return new Intl.DateTimeFormat(getLocale(), {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(unixSeconds * 1000);
}
