import { DrizzleQueryError, eq, inArray, sql, type SQL } from 'drizzle-orm';
import type {
  ArtistPageRef,
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
      country: card.country,
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
