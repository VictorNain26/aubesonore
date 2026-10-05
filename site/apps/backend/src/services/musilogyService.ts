import { DrizzleQueryError, eq, inArray, sql, type SQL } from 'drizzle-orm';
import type {
  ArtistFacts,
  ArtistLink,
  ArtistPageRef,
  ArtistPlatform,
  MusilogyArtist,
  MusilogyArtistRef,
  MusilogyInfluence,
  MusilogyLink,
  MusilogyLinkKind,
  MusilogyNeighbour,
  MusilogySearchHit,
} from '@aubesonore/shared-types/client';
import { db } from '../db/index';
import { artist, artistSlug } from '../db/schema';
import { TtlCache } from '../lib/cache/ttlCache';
import { createSingleFlight } from '../lib/singleFlight';

// Every musilogy read goes through the functions `musilogy load` installs,
// whose signatures are the contract of musilogy/docs/conception.md §4 (each
// delivered one is tested there against Postgres): the site never reads
// musilogy's tables. Which artists the
// antenna played is the site's own data, read from `artist`.
// node-postgres returns bigint as a string; every count here fits a double.

const ONE_HOUR_MS = 60 * 60_000;
// musilogy only changes when it is loaded again.
export const musilogyCache = new TtlCache<MusilogyArtist | null>(ONE_HOUR_MS);
// One query per artist however many ask at once: a shared link opened by many.
const flight = createSingleFlight<MusilogyArtist | null>();

/** The musilogy schema, or the function asked, is not loaded. */
export class MusilogyUnavailable extends Error {}

// invalid_schema_name, undefined_function, undefined_table: before the first
// `musilogy load`, or before the load that brings a function.
const NOT_LOADED = new Set(['3F000', '42883', '42P01']);

async function call<R extends Record<string, unknown>>(query: SQL): Promise<R[]> {
  try {
    return (await db.execute<R>(query)).rows as R[];
  } catch (err) {
    const code =
      err instanceof DrizzleQueryError
        ? (err.cause as { code?: string } | undefined)?.code
        : undefined;
    if (code && NOT_LOADED.has(code)) throw new MusilogyUnavailable(code);
    throw err;
  }
}

/** A section whose function is not loaded yet is unknown (null), not empty. */
async function section<R extends Record<string, unknown>>(query: SQL): Promise<R[] | null> {
  try {
    return await call<R>(query);
  } catch (err) {
    if (err instanceof MusilogyUnavailable) return null;
    throw err;
  }
}

type Int8 = string;

interface CardRow extends Record<string, unknown> {
  mbid: string;
  name: string;
  disambiguation: string | null;
  type: string;
  country: string | null;
  begin_area: string | null;
  y0: number | null;
  y0_source: string | null;
  y_end: number | null;
  y_end_source: string | null;
  ended: boolean | null;
  genres: Array<{ name: string }> | null;
  user_count: Int8 | null;
  proximity_surveyed: boolean | null;
}

interface NeighbourRow extends Record<string, unknown> {
  mbid: string;
  name: string;
  disambiguation: string | null;
  y0: number | null;
  y_end: number | null;
  score: number;
  side: 'before' | 'during' | 'after' | null;
}

interface InfluenceRow extends Record<string, unknown> {
  direction: 'cited' | 'cited_by';
  mbid: string;
  name: string;
  disambiguation: string | null;
  y0: number | null;
  statement: string;
}

interface LinkRow extends Record<string, unknown> {
  type: string;
  direction: 'forward' | 'backward';
  other_mbid: string;
  other_name: string;
  other_disambiguation: string | null;
  other_y0: number | null;
  y_begin: number | null;
  y_end: number | null;
}

interface SearchRow extends Record<string, unknown> {
  mbid: string;
  name: string;
  disambiguation: string | null;
  type: string;
  y0: number | null;
  user_count: Int8 | null;
}

// The band links Musilogy shows, by MusicBrainz relation and by the side the
// artist stands on (checked on the loaded data, 2026-10-04): the source of
// `member of band` is the member, of `founder` the founder, of `subgroup` the
// subgroup (Audioslave → Rage Against the Machine), of `artist rename` the
// former name (Warsaw → Joy Division), of `is person` the person behind an
// alias (Damon Albarn → Dan Abnormal), of `collaboration` the participant.
// Family, teaching, tributes and the rest are not band history.
const LINK_KINDS: Record<string, { forward: MusilogyLinkKind; backward: MusilogyLinkKind }> = {
  'member of band': { forward: 'memberOf', backward: 'members' },
  founder: { forward: 'founded', backward: 'foundedBy' },
  subgroup: { forward: 'subgroupOf', backward: 'subgroups' },
  'artist rename': { forward: 'renamedTo', backward: 'renamedFrom' },
  'is person': { forward: 'aliases', backward: 'aliasOf' },
  collaboration: { forward: 'collaboratedIn', backward: 'collaborators' },
};

async function playedByMbid(mbids: string[]): Promise<Map<string, ArtistPageRef>> {
  if (mbids.length === 0) return new Map();
  const rows = await db
    .select({ id: artist.id, slug: artistSlug.slug, mbid: artist.mbid })
    .from(artist)
    .innerJoin(artistSlug, eq(artistSlug.artistId, artist.id))
    .where(inArray(artist.mbid, [...new Set(mbids)]));
  return new Map(
    rows.flatMap((r) => (r.mbid ? [[r.mbid, { id: r.id, slug: r.slug }] as const] : []))
  );
}

const toCount = (value: Int8 | null): number | null => (value === null ? null : Number(value));

export async function getMusilogyArtist(mbid: string): Promise<MusilogyArtist | null> {
  const cached = musilogyCache.get(mbid);
  if (cached !== undefined) return cached;
  return flight(mbid, () => loadArtist(mbid));
}

async function loadArtist(mbid: string): Promise<MusilogyArtist | null> {
  const [cards, neighbourRows, influenceRows, linkRows] = await Promise.all([
    call<CardRow>(sql`SELECT * FROM musilogy.artist_card(${mbid})`),
    section<NeighbourRow>(sql`SELECT * FROM musilogy.artist_neighbours(${mbid})`),
    section<InfluenceRow>(sql`SELECT * FROM musilogy.artist_influences(${mbid})`),
    call<LinkRow>(sql`SELECT * FROM musilogy.artist_links(${mbid})`),
  ]);
  const card = cards[0];
  if (!card) {
    musilogyCache.set(mbid, null);
    return null;
  }

  const bandLinks = linkRows.flatMap((row) => {
    const kinds = LINK_KINDS[row.type];
    return kinds ? [{ row, kind: kinds[row.direction] }] : [];
  });
  const played = await playedByMbid([
    card.mbid,
    ...(neighbourRows ?? []).map((row) => row.mbid),
    ...(influenceRows ?? []).map((row) => row.mbid),
    ...bandLinks.map(({ row }) => row.other_mbid),
  ]);
  const ref = (
    mbidOf: string,
    name: string,
    disambiguation: string | null,
    y0: number | null
  ): MusilogyArtistRef => ({
    mbid: mbidOf,
    name,
    disambiguation,
    y0,
    played: played.get(mbidOf) ?? null,
  });

  const neighbour = (row: NeighbourRow): MusilogyNeighbour => ({
    ...ref(row.mbid, row.name, row.disambiguation, row.y0),
    yEnd: row.y_end,
    score: row.score,
  });
  const influence = (row: InfluenceRow): MusilogyInfluence => ({
    ...ref(row.mbid, row.name, row.disambiguation, row.y0),
    statement: row.statement,
  });
  const link = ({ row, kind }: { row: LinkRow; kind: MusilogyLinkKind }): MusilogyLink => ({
    ...ref(row.other_mbid, row.other_name, row.other_disambiguation, row.other_y0),
    kind,
    yBegin: row.y_begin,
    yEnd: row.y_end,
  });

  const result: MusilogyArtist = {
    card: {
      ...ref(card.mbid, card.name, card.disambiguation, card.y0),
      type: card.type,
      country: regionOf(card.country),
      beginArea: card.begin_area,
      y0Source: card.y0_source,
      yEnd: card.y_end,
      yEndSource: card.y_end_source,
      ended: card.ended,
      genres: (card.genres ?? []).map((genre) => genre.name),
      listeners: toCount(card.user_count),
      proximitySurveyed: card.proximity_surveyed ?? null,
    },
    neighbours: neighbourRows && {
      before: neighbourRows.filter((row) => row.side === 'before').map(neighbour),
      during: neighbourRows.filter((row) => row.side === 'during').map(neighbour),
      after: neighbourRows.filter((row) => row.side === 'after').map(neighbour),
      undated: neighbourRows.filter((row) => row.side === null).map(neighbour),
    },
    influences: influenceRows && {
      cites: influenceRows.filter((row) => row.direction === 'cited').map(influence),
      citedBy: influenceRows.filter((row) => row.direction === 'cited_by').map(influence),
    },
    links: bandLinks.map(link),
  };
  musilogyCache.set(mbid, result);
  return result;
}

export const SEARCH_PAGE = 12;

export async function searchMusilogy(query: string): Promise<MusilogySearchHit[]> {
  const rows = await call<SearchRow>(
    sql`SELECT * FROM musilogy.search_artists(${query}, ${SEARCH_PAGE})`
  );
  return rows.map((row) => ({
    mbid: row.mbid,
    name: row.name,
    disambiguation: row.disambiguation,
    type: row.type,
    y0: row.y0,
    listeners: toCount(row.user_count),
  }));
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

/**
 * Only a group's dates and begin area are a career; a person's are a birth.
 * A begin area that only repeats the country is left out: 11 % of groups
 * have one (2 168 of 20 000 sampled, 2026-10-05).
 */
function toFacts(card: CardRow): ArtistFacts {
  const kind = KINDS[card.type] ?? null;
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

interface UrlRow extends Record<string, unknown> {
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
function toLinks(rows: UrlRow[]): ArtistLink[] {
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

function wikidataIdOf(rows: UrlRow[]): string | null {
  const ids = new Set(
    rows.flatMap((row) => {
      const match = row.type === 'wikidata' ? WIKIDATA_ITEM.exec(row.url) : null;
      return match?.[1] ? [match[1]] : [];
    })
  );
  const [only] = ids;
  return ids.size === 1 && only ? only : null;
}

/** Who the artist is, as the dump states it: the profile's facts and links. */
export interface ArtistIdentity {
  facts: ArtistFacts;
  links: ArtistLink[];
  /** The Wikidata item, the way to the artist's Wikipedia articles. */
  wikidataId: string | null;
}

export const identityCache = new TtlCache<ArtistIdentity | null>(ONE_HOUR_MS);
const identityFlight = createSingleFlight<ArtistIdentity | null>();

/**
 * The facts, listening links and Wikidata item of an artist, null when the
 * dump does not know its MBID. Throws MusilogyUnavailable before a load.
 */
export function getArtistIdentity(mbid: string): Promise<ArtistIdentity | null> {
  const cached = identityCache.get(mbid);
  if (cached !== undefined) return Promise.resolve(cached);
  return identityFlight(mbid, async () => {
    const [cards, urls] = await Promise.all([
      call<CardRow>(sql`SELECT * FROM musilogy.artist_card(${mbid})`),
      call<UrlRow>(sql`SELECT * FROM musilogy.artist_urls(${mbid})`),
    ]);
    const card = cards[0];
    const identity = card
      ? { facts: toFacts(card), links: toLinks(urls), wikidataId: wikidataIdOf(urls) }
      : null;
    identityCache.set(mbid, identity);
    return identity;
  });
}
