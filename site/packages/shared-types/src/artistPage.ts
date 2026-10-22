// How an artist page names itself, the same on the server (its <title>) and in the browser (the
// tab, once the page is drawn or reached by a link): search engines render the page and keep the
// title it ends with.
import type { ArtistFacts, ArtistProfile, MusilogyArtist, SiteLocale } from './client';

const KINDS: Record<SiteLocale, Record<NonNullable<ArtistFacts['kind']>, string>> = {
  fr: { person: 'artiste', group: 'groupe', orchestra: 'orchestre', choir: 'chœur' },
  en: { person: 'artist', group: 'band', orchestra: 'orchestra', choir: 'choir' },
};

const SIMILAR: Record<SiteLocale, string> = { fr: 'artistes similaires', en: 'similar artists' };

/** « groupe », "band": what the artist is, in the page's language, lowercase. */
export function kindWord(kind: NonNullable<ArtistFacts['kind']>, locale: SiteLocale): string {
  return KINDS[locale][kind];
}

/** A country's name in the page's language, or undefined for a code Intl does not know. */
export function countryName(code: string, locale: SiteLocale): string | undefined {
  try {
    return new Intl.DisplayNames([locale], { type: 'region' }).of(code);
  } catch {
    return undefined;
  }
}

/**
 * « Kraftwerk (groupe, Düsseldorf) : artistes similaires »: the parenthesis tells homonyms apart
 * (nine artists are called Cassius); the page's offer is named only when it holds it.
 */
export function artistPageName(
  profile: Pick<ArtistProfile, 'name' | 'facts'>,
  musilogy: Pick<MusilogyArtist, 'sameSound' | 'colisten'> | null,
  locale: SiteLocale
): string {
  const facts = profile.facts;
  const where = facts?.place ?? (facts?.country ? countryName(facts.country, locale) : undefined);
  const about = [facts?.kind ? kindWord(facts.kind, locale) : undefined, where].filter(Boolean);
  const name = about.length > 0 ? `${profile.name} (${about.join(', ')})` : profile.name;
  if (!musilogy?.sameSound?.length && !musilogy?.colisten?.length) return name;
  return `${name}${locale === 'fr' ? ' : ' : ': '}${SIMILAR[locale]}`;
}
