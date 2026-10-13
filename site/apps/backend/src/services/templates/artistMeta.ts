import type {
  ArtistFacts,
  ArtistProfile,
  MusilogyArtist,
  SiteLocale,
} from '@aubesonore/shared-types/client';
import { artistPageName, countryName, kindWord } from '@aubesonore/shared-types/artist-page';

const WORDS = {
  fr: {
    since: (y: number) => `depuis ${y}`,
    formed: (y: number) => `formé en ${y}`,
    range: (from: number, to: number) => `de ${from} à ${to}`,
    sameSound: (names: string) => `Artistes similaires : ${names}.`,
    records: 'ses albums et EP',
    bands: 'ses groupes et projets',
    holds: (parts: string) => `${parts.charAt(0).toUpperCase()}${parts.slice(1)}.`,
    fallback: (name: string) =>
      `${name} sur AubeSonore, la radio de découverte indé, électro, hip-hop.`,
  },
  en: {
    since: (y: number) => `since ${y}`,
    formed: (y: number) => `formed in ${y}`,
    range: (from: number, to: number) => `${from} to ${to}`,
    sameSound: (names: string) => `Similar artists: ${names}.`,
    records: 'their albums and EPs',
    bands: 'their bands and projects',
    holds: (parts: string) => `${parts.charAt(0).toUpperCase()}${parts.slice(1)}.`,
    fallback: (name: string) =>
      `${name} on AubeSonore, the indie, electronic, hip-hop discovery radio.`,
  },
} as const;

/** What the page's « Groupes et projets » section counts (bandCount, musilogy/ArtistSections.tsx). */
function bandCount({ bands, memberProjects, otherNames }: MusilogyArtist): number {
  return (
    (bands ? bands.members.length + bands.groups.length : 0) +
    (memberProjects?.length ?? 0) +
    (otherNames?.length ?? 0)
  );
}

/** How many similar artists the description names: enough to answer, short enough to show. */
const NAMED_NEIGHBOURS = 4;
const DESCRIPTION_MAX = 200;

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1).trimEnd()}…`;
}

/** The page's <title>: its name (artistPageName, shared with the browser's tab) and the site's. */
export function artistTitle(
  profile: ArtistProfile,
  musilogy: MusilogyArtist | null,
  locale: SiteLocale
): string {
  return `${artistPageName(profile, musilogy, locale)} · AubeSonore`;
}

/** "Groupe · Düsseldorf, Allemagne · depuis 1970": what MusicBrainz states, as on the page. */
function factsLine(facts: ArtistFacts, locale: SiteLocale): string | null {
  const words = WORDS[locale];
  const country = facts.country ? countryName(facts.country, locale) : undefined;
  const where = [facts.place, country].filter(Boolean).join(', ');
  const when = !facts.formed
    ? ''
    : facts.ended
      ? words.range(facts.formed, facts.ended)
      : facts.active
        ? words.since(facts.formed)
        : words.formed(facts.formed);
  const kind = facts.kind ? kindWord(facts.kind, locale) : '';
  const parts = [kind && `${kind.charAt(0).toUpperCase()}${kind.slice(1)}`, where, when].filter(
    Boolean
  );
  return parts.length > 0 ? `${parts.join(' · ')}.` : null;
}

/**
 * Built from the page's own data, so each page has its own (Google encourages programmatic
 * descriptions for database-driven sites: developers.google.com/search/docs/appearance/snippet):
 * the facts, the first similar artists by name, what else the page holds. Without any of them, the
 * Wikipedia opening; without it, a sentence naming the site.
 */
export function artistDescription(
  profile: ArtistProfile,
  musilogy: MusilogyArtist | null,
  locale: SiteLocale
): string {
  const words = WORDS[locale];
  const neighbours = musilogy?.neighbours ?? [];
  const holds = [
    musilogy?.releases?.length ? words.records : null,
    musilogy && bandCount(musilogy) > 0 ? words.bands : null,
  ].filter((part) => part !== null);
  const sentences = [
    profile.facts ? factsLine(profile.facts, locale) : null,
    neighbours.length > 0
      ? words.sameSound(
          neighbours
            .slice(0, NAMED_NEIGHBOURS)
            .map((n) => n.name)
            .join(', ')
        )
      : null,
    holds.length > 0 ? words.holds(holds.join(', ')) : null,
  ].filter((sentence): sentence is string => sentence !== null);
  if (neighbours.length > 0 || holds.length > 0) {
    return truncate(sentences.join(' '), DESCRIPTION_MAX);
  }
  if (profile.summary) return truncate(profile.summary.text, DESCRIPTION_MAX);
  return sentences[0] ?? words.fallback(profile.name);
}
