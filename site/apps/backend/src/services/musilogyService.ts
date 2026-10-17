import { eq, inArray, sql, type SQL } from 'drizzle-orm';
import {
  type ArtistCover,
  type ArtistFacts,
  type ArtistLink,
  type ArtistPageRef,
  type MusilogyArtist,
  type MusilogyArtistRef,
  type MusilogyBandmate,
  type MusilogyNeighbour,
  type MusilogyOtherName,
  type MusilogyProject,
  type MusilogyRelease,
  type MusilogySearchHit,
} from '@aubesonore/shared-types/client';
import { mbidSlug, ownSlug, pageSlug, slugsFor } from './artistSlugs';
import {
  deezerIdOf,
  firstCoverOf,
  kindOf,
  toFacts,
  toLinks,
  wikidataIdOf,
  type CardRow,
  type ReleaseRow,
  type UrlRow,
} from './musilogyMapping';
import { db } from '../db/index';
import { isUndefinedObject, pgCode } from '../db/errors';
import { artist } from '../db/schema';
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

async function call<R extends Record<string, unknown>>(query: SQL): Promise<R[]> {
  try {
    return (await db.execute<R>(query)).rows as R[];
  } catch (err) {
    // Before the first `musilogy load`, or before the load that brings a function.
    if (isUndefinedObject(err)) throw new MusilogyUnavailable(pgCode(err));
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

interface NeighbourRow extends Record<string, unknown> {
  mbid: string;
  name: string;
  disambiguation: string | null;
  y0: number | null;
  y_end: number | null;
  ended: boolean | null;
  rank: number;
  term: string;
}

interface BandRow extends Record<string, unknown> {
  role: 'member' | 'group';
  mbid: string;
  name: string;
  disambiguation: string | null;
  y0: number | null;
  y_begin: number | null;
  y_end: number | null;
}

interface ProjectRow extends Record<string, unknown> {
  mbid: string;
  name: string;
  disambiguation: string | null;
  y0: number | null;
  via: string[];
}

interface OtherNameRow extends Record<string, unknown> {
  kind: MusilogyOtherName['kind'];
  mbid: string;
  name: string;
  disambiguation: string | null;
  y0: number | null;
}

interface SearchRow extends Record<string, unknown> {
  mbid: string;
  name: string;
  disambiguation: string | null;
  type: string | null;
  y0: number | null;
}

async function playedByMbid(mbids: string[]): Promise<Map<string, ArtistPageRef>> {
  if (mbids.length === 0) return new Map();
  const rows = await db
    .select({ id: artist.id, slug: pageSlug, mbid: artist.mbid })
    .from(artist)
    .leftJoin(mbidSlug, eq(mbidSlug.mbid, artist.mbid))
    .leftJoin(ownSlug, eq(ownSlug.artistId, artist.id))
    .where(inArray(artist.mbid, [...new Set(mbids)]));
  return new Map(
    rows.flatMap((r) => (r.mbid && r.slug ? [[r.mbid, { id: r.id, slug: r.slug }] as const] : []))
  );
}

/**
 * The card and the records, which both the artist's profile (getArtistIdentity)
 * and Musilogy's sections read: one query each per artist, shared.
 */
interface Core {
  card: CardRow | null;
  releases: ReleaseRow[] | null;
}

export const coreCache = new TtlCache<Core>(ONE_HOUR_MS);
const coreFlight = createSingleFlight<Core>();

function readCore(mbid: string): Promise<Core> {
  const cached = coreCache.get(mbid);
  if (cached !== undefined) return Promise.resolve(cached);
  return coreFlight(mbid, async () => {
    const [cards, releases] = await Promise.all([
      call<CardRow>(sql`SELECT * FROM musilogy.artist_card(${mbid})`),
      section<ReleaseRow>(sql`SELECT * FROM musilogy.artist_releases(${mbid})`),
    ]);
    const core = { card: cards[0] ?? null, releases };
    coreCache.set(mbid, core);
    return core;
  });
}

export async function getMusilogyArtist(mbid: string): Promise<MusilogyArtist | null> {
  const cached = musilogyCache.get(mbid);
  if (cached !== undefined) return cached;
  return flight(mbid, () => loadArtist(mbid));
}

async function loadArtist(mbid: string): Promise<MusilogyArtist | null> {
  const [{ card, releases: releaseRows }, neighbourRows, bandRows, projectRows, nameRows] =
    await Promise.all([
      readCore(mbid),
      section<NeighbourRow>(sql`SELECT * FROM musilogy.artist_same_sound(${mbid})`),
      section<BandRow>(sql`SELECT * FROM musilogy.artist_bands(${mbid})`),
      section<ProjectRow>(sql`SELECT * FROM musilogy.artist_member_projects(${mbid})`),
      section<OtherNameRow>(sql`SELECT * FROM musilogy.artist_other_names(${mbid})`),
    ]);
  if (!card) {
    musilogyCache.set(mbid, null);
    return null;
  }

  // The page and every page it links to: their addresses are published here.
  const linked = [
    { mbid: card.mbid, name: card.name },
    ...[neighbourRows, bandRows, projectRows, nameRows].flatMap((rows) =>
      (rows ?? []).map((row) => ({ mbid: row.mbid, name: row.name }))
    ),
  ];
  const [played, slugs] = await Promise.all([
    playedByMbid(linked.map((page) => page.mbid)),
    slugsFor(linked),
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
    slug: slugs.get(mbidOf) ?? null,
  });

  const neighbour = (row: NeighbourRow): MusilogyNeighbour => ({
    ...ref(row.mbid, row.name, row.disambiguation, row.y0),
    yEnd: row.y_end,
    ended: row.ended === true,
    rank: row.rank,
    term: row.term,
  });
  const bandmate = (row: BandRow): MusilogyBandmate => ({
    ...ref(row.mbid, row.name, row.disambiguation, row.y0),
    yBegin: row.y_begin,
    yEnd: row.y_end,
  });
  const release = (row: ReleaseRow): MusilogyRelease => ({
    mbid: row.mbid,
    title: row.title,
    type: row.primary_type === 'EP' ? 'ep' : 'album',
    soundtrack: row.soundtrack,
    remix: row.remix,
    year: row.y,
  });

  const result: MusilogyArtist = {
    card: {
      ...ref(card.mbid, card.name, card.disambiguation, card.y0),
      kind: kindOf(card.type),
      y0Source: card.y0_source,
      yEnd: card.y_end,
      yEndSource: card.y_end_source,
      ended: card.ended,
      styles: (card.styles ?? []).map((style) => style.style),
    },
    // By rank, not score: musilogy settles equal scores, common among artists with few listeners.
    neighbours: neighbourRows && neighbourRows.map(neighbour).sort((a, b) => a.rank - b.rank),
    releases: releaseRows && releaseRows.map(release),
    bands: bandRows && {
      members: bandRows.filter((row) => row.role === 'member').map(bandmate),
      groups: bandRows.filter((row) => row.role === 'group').map(bandmate),
    },
    memberProjects:
      projectRows &&
      projectRows.map(
        (row): MusilogyProject => ({
          ...ref(row.mbid, row.name, row.disambiguation, row.y0),
          via: row.via,
        })
      ),
    otherNames:
      nameRows &&
      nameRows.map(
        (row): MusilogyOtherName => ({
          ...ref(row.mbid, row.name, row.disambiguation, row.y0),
          kind: row.kind,
        })
      ),
  };
  musilogyCache.set(mbid, result);
  return result;
}

const SEARCH_PAGE = 12;

export async function searchMusilogy(query: string): Promise<MusilogySearchHit[]> {
  const rows = await call<SearchRow>(
    sql`SELECT * FROM musilogy.search_artists(${query}, ${SEARCH_PAGE})`
  );
  const slugs = await slugsFor(rows);
  return rows.map((row) => ({
    mbid: row.mbid,
    name: row.name,
    disambiguation: row.disambiguation,
    kind: kindOf(row.type),
    y0: row.y0,
    slug: slugs.get(row.mbid) ?? null,
  }));
}

/** Who the artist is, as the dump states it: the profile's facts and links. */
export interface ArtistIdentity {
  name: string;
  facts: ArtistFacts;
  links: ArtistLink[];
  /** The Wikidata item, the way to the artist's Wikipedia articles. */
  wikidataId: string | null;
  /** The cover of the first record, hotlinked from the Cover Art Archive. */
  firstCover: ArtistCover | null;
  /** The Deezer artist the dump declares, when it declares exactly one. */
  deezerId: string | null;
  /** How many albums and EPs the page shows. */
  records: number;
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
    const [{ card, releases }, urls] = await Promise.all([
      readCore(mbid),
      call<UrlRow>(sql`SELECT * FROM musilogy.artist_urls(${mbid})`),
    ]);
    const identity = card
      ? {
          name: card.name,
          facts: toFacts(card),
          links: toLinks(urls),
          wikidataId: wikidataIdOf(urls),
          firstCover: firstCoverOf(releases ?? []),
          deezerId: deezerIdOf(urls),
          records: releases?.length ?? 0,
        }
      : null;
    identityCache.set(mbid, identity);
    return identity;
  });
}
