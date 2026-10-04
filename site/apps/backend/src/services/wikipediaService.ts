import type { ArtistSummary, SiteLocale } from '@aubesonore/shared-types/client';
import { env } from '../config/env';
import { TtlCache } from '../lib/cache/ttlCache';
import { createSingleFlight } from '../lib/singleFlight';
import { logger } from '../lib/logger';
import type { Lookup } from '../lib/lookup';

const TTL_MS = 7 * 24 * 60 * 60 * 1000;
const NEGATIVE_TTL_MS = 24 * 60 * 60 * 1000;
const TIMEOUT_MS = 5_000;
const MAX_SENTENCES = 2;
const MAX_LENGTH = 300;

export const wikipediaCache = new TtlCache<ArtistSummary | null>(TTL_MS);
const flight = createSingleFlight<ArtistSummary | null | 'failed'>();

// Wikimedia blocks scripts without a contact in their User-Agent.
// https://foundation.wikimedia.org/wiki/Policy:Wikimedia_Foundation_User-Agent_Policy
async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: { 'User-Agent': env.OUTBOUND_USER_AGENT },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return (await response.json()) as T;
}

async function articleTitles(wikidataId: string): Promise<Record<SiteLocale, string | undefined>> {
  const body = await getJson<{
    entities?: Record<string, { sitelinks?: Record<string, { title?: string }> }>;
  }>(
    `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${wikidataId}` +
      '&props=sitelinks&sitefilter=frwiki|enwiki&format=json'
  );
  const sitelinks = body.entities?.[wikidataId]?.sitelinks ?? {};
  return { fr: sitelinks.frwiki?.title, en: sitelinks.enwiki?.title };
}

// An initial ("J. Tillman") or a short title ("Dr. Dre", "Mr. Oizo", "St.
// Vincent") ends on a period that the Unicode sentence rules take for the end
// of a sentence.
const ENDS_ON_ABBREVIATION = /(?:^|[\s(])\p{Lu}\p{Ll}{0,2}\.\s*$/u;

/**
 * The opening of a text: its first sentence, and the next ones while the whole
 * stays short — a summary, not the article.
 */
export function firstSentences(text: string, lang: SiteLocale): string {
  const sentences: string[] = [];
  for (const { segment } of new Intl.Segmenter(lang, { granularity: 'sentence' }).segment(text)) {
    const last = sentences.length - 1;
    if (last >= 0 && ENDS_ON_ABBREVIATION.test(sentences[last] ?? '')) sentences[last] += segment;
    else sentences.push(segment);
  }

  let summary = sentences[0] ?? '';
  for (const sentence of sentences.slice(1, MAX_SENTENCES)) {
    if (summary.length + sentence.length > MAX_LENGTH) break;
    summary += sentence;
  }
  return summary.trim();
}

async function summaryOf(lang: SiteLocale, title: string): Promise<ArtistSummary | null> {
  const body = await getJson<{
    type?: string;
    extract?: string;
    content_urls?: { desktop?: { page?: string } };
  }>(
    `https://${lang}.wikipedia.org/api/rest_v1/page/summary/` +
      encodeURIComponent(title.replace(/ /g, '_'))
  );
  const url = body.content_urls?.desktop?.page;
  // A disambiguation page describes several artists, so none of them.
  if (body.type !== 'standard' || !body.extract || !url) return null;
  return { text: firstSentences(body.extract, lang), lang, url };
}

/**
 * The opening of the artist's Wikipedia article, in the page language when
 * the article exists in it. A failure is never cached as "no article".
 */
export async function getSummary(
  wikidataId: string,
  locale: SiteLocale
): Promise<Lookup<ArtistSummary>> {
  const key = `${wikidataId}:${locale}`;
  const cached = wikipediaCache.get(key);
  if (cached !== undefined) return cached ? { status: 'found', value: cached } : { status: 'none' };

  const result = await flight(key, async () => {
    try {
      const titles = await articleTitles(wikidataId);
      const other: SiteLocale = locale === 'fr' ? 'en' : 'fr';
      const lang = titles[locale] ? locale : titles[other] ? other : null;
      const title = lang ? titles[lang] : undefined;
      const summary = lang && title ? await summaryOf(lang, title) : null;
      wikipediaCache.set(key, summary, summary ? undefined : NEGATIVE_TTL_MS);
      return summary;
    } catch (err) {
      logger.warn('wikipedia.fetch_failed', { wikidataId, message: (err as Error).message });
      return 'failed';
    }
  });
  if (result === 'failed') return { status: 'failed' };
  return result ? { status: 'found', value: result } : { status: 'none' };
}
