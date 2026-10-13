import type { SiteLocale } from '@aubesonore/shared-types/client';

/**
 * The site's language a request asks for: the first fr/en token of its Accept-Language, French
 * by default. Deliberately naive (no q-values): the header is nearly always one locale, or fr and
 * en in order.
 */
export function requestLocale(acceptLanguage: string | null | undefined): SiteLocale {
  const match = /(?:^|,)\s*(fr|en)\b/i.exec(acceptLanguage ?? '');
  return match?.[1]?.toLowerCase() === 'en' ? 'en' : 'fr';
}
