import {
  coverArtUrl,
  type ArtistCover,
  type ArtistFacts,
  type ArtistLink,
  type ArtistPlatform,
} from '@aubesonore/shared-types/client';

// What musilogy's SQL functions return, turned into what the page shows: pure functions, no
// database, so each rule is read and tested on its own (musilogyMapping.test.ts).

export interface CardRow extends Record<string, unknown> {
  mbid: string;
  name: string;
  disambiguation: string | null;
  type: string | null;
  country: string | null;
  begin_area: string | null;
  y0: number | null;
  y0_source: string | null;
  y_end: number | null;
  y_end_source: string | null;
  ended: boolean | null;
  genres: Array<{ name: string }> | null;
}

/**
 * A country the page can name. MusicBrainz also files dissolved countries,
 * which Intl names as today's (SU as Russia, YU as Serbia: their likely
 * region is another), and regions of its own (XW Worldwide, XE Europe),
 * which Intl cannot name; XK, Kosovo, it can. On the loaded dump this leaves
 * out 4 343 artists' codes of 1 411 607, and no current country (2026-10-05).
 */
function regionOf(code: string | null): string | null {
  if (!code) return null;
  try {
    const likely = new Intl.Locale(`und-${code}`).maximize().region;
    const name = new Intl.DisplayNames(['en'], { type: 'region' }).of(code);
    return likely === code && name !== code ? code : null;
  } catch {
    return null;
  }
}

const KINDS: Record<string, ArtistFacts['kind']> = {
  Person: 'person',
  Group: 'group',
  Orchestra: 'orchestra',
  Choir: 'choir',
};

/** MusicBrainz's artist type as the site words it; a character, "Other" or no type says nothing. */
export function kindOf(type: string | null): ArtistFacts['kind'] {
  return type ? (KINDS[type] ?? null) : null;
}

/**
 * Only a group's dates and begin area are a career; a person's are a birth,
 * and those of an artist without a type, a character or an "other" may be
 * either: neither is said.
 * A begin area that only repeats the country is left out: 11 % of groups
 * have one (2 168 of 20 000 sampled, 2026-10-05).
 */
export function toFacts(card: CardRow): ArtistFacts {
  const kind = kindOf(card.type);
  const isGroup = kind !== null && kind !== 'person';
  const country = regionOf(card.country);
  const countryName = country && new Intl.DisplayNames(['en'], { type: 'region' }).of(country);
  return {
    kind,
    place: isGroup && card.begin_area !== countryName ? card.begin_area : null,
    country,
    formed: isGroup && card.y0_source === 'declared' ? card.y0 : null,
    ended: isGroup && card.y_end_source === 'declared' ? card.y_end : null,
    active: isGroup && card.ended === false,
  };
}

export interface UrlRow extends Record<string, unknown> {
  type: string | null;
  url: string;
}

// Listening platforms first, the official site last. Deezer is left out: the
// artist's own Deezer id is already known, exactly.
const LINK_ORDER: ArtistPlatform[] = [
  'spotify',
  'appleMusic',
  'bandcamp',
  'soundcloud',
  'official',
];

const LINK_HOSTS: Array<[string, ArtistPlatform]> = [
  ['open.spotify.com', 'spotify'],
  ['music.apple.com', 'appleMusic'],
  ['bandcamp.com', 'bandcamp'],
  ['soundcloud.com', 'soundcloud'],
];

function platformOf(url: URL, relationType: string | null): ArtistPlatform | null {
  if (relationType === 'official homepage') return 'official';
  const host = url.hostname;
  const entry = LINK_HOSTS.find(([suffix]) => host === suffix || host.endsWith(`.${suffix}`));
  return entry ? entry[1] : null;
}

/**
 * One link per platform and per address, https only. artist_urls gives the
 * pages still the artist's: a former address may belong to someone else now.
 */
export function toLinks(rows: UrlRow[]): ArtistLink[] {
  const links = new Map<ArtistPlatform, string>();
  for (const row of rows) {
    if (!row.url.startsWith('https://') || !URL.canParse(row.url)) continue;
    const platform = platformOf(new URL(row.url), row.type);
    if (platform && !links.has(platform)) links.set(platform, row.url);
  }
  // In LINK_ORDER the official site comes last: when it is the Bandcamp page,
  // it is listed once, as Bandcamp.
  const listed = new Set<string>();
  return LINK_ORDER.flatMap((platform) => {
    const url = links.get(platform);
    if (!url || listed.has(url)) return [];
    listed.add(url);
    return [{ platform, url }];
  });
}

const WIKIDATA_ITEM = /^https?:\/\/www\.wikidata\.org\/wiki\/(Q\d+)$/;

export function wikidataIdOf(rows: UrlRow[]): string | null {
  const ids = new Set(
    rows.flatMap((row) => {
      const match = row.type === 'wikidata' ? WIKIDATA_ITEM.exec(row.url) : null;
      return match?.[1] ? [match[1]] : [];
    })
  );
  const [only] = ids;
  return ids.size === 1 && only ? only : null;
}

export interface ReleaseRow extends Record<string, unknown> {
  mbid: string;
  title: string;
  primary_type: string;
  soundtrack: boolean;
  remix: boolean;
  y: number | null;
}

/**
 * The cover of the artist's first album, else of its first EP: the portrait
 * when Wikimedia Commons has no photo of the artist (docs/vision.md §2.4); the
 * page draws the artist's dawn without one. A photo or this cover exist for
 * 95.7 % of the played artists, 60.3 % of 300 neighbours pages show
 * (2026-10-11).
 */
export function firstCoverOf(releases: ReleaseRow[]): ArtistCover | null {
  // The earliest dated one, whatever order artist_releases gives.
  const earliest = (rows: ReleaseRow[]) =>
    rows.reduce<ReleaseRow | undefined>(
      (best, r) => (r.y !== null && (best?.y == null || r.y < best.y) ? r : best),
      undefined
    );
  const albums = releases.filter((r) => r.primary_type === 'Album');
  const first = earliest(albums) ?? albums[0] ?? earliest(releases) ?? releases[0];
  return first ? { url: coverArtUrl(first.mbid, 500), title: first.title, year: first.y } : null;
}

const DEEZER_ARTIST = /^https:\/\/www\.deezer\.com\/artist\/(\d+)$/;

export function deezerIdOf(rows: UrlRow[]): string | null {
  const ids = new Set(rows.flatMap((row) => DEEZER_ARTIST.exec(row.url)?.[1] ?? []));
  const [only] = ids;
  return ids.size === 1 && only ? only : null;
}
