import { and, eq, inArray, isNull, like, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db } from '../db';
import { artist, artistSlug } from '../db/schema';
import { slugify } from '../lib/artistName';
import { isValidArtistSlug } from '../validators/artistValidator';

/**
 * Every artist page has one address, its slug (docs/vision.md §5), given the first time the site
 * publishes it (a page served, a link drawn, a search's hit, the sitemap) and kept for good: an
 * address no one was shown need not exist yet. The page of an MBID is named by it, whether the
 * antenna played the artist or not; a played artist without an MBID, which Musilogy cannot know,
 * by its row. The slug of a row whose artist has an MBID since is an older address of that MBID's
 * page, which answers a 301 there. Among homonyms, the plain name goes to the most listened
 * (musilogy.artist_homonym_rank), whichever is published first.
 */
type Owner = { mbid: string } | { artistId: string };
type Executor = Pick<typeof db, 'select' | 'insert' | 'update'>;

/** The page slug of an artist row: its MBID's when it has one, else its own. */
export const mbidSlug = alias(artistSlug, 'mbid_slug');
export const ownSlug = alias(artistSlug, 'own_slug');
export const pageSlug = sql<string | null>`coalesce(${mbidSlug.slug}, ${ownSlug.slug})`;

/**
 * The first slug no page holds, from the one an artist's rank among homonyms proposes: `base`
 * for the first, `base-2` for the second, then on (`cassius`, `cassius-2`…).
 */
export function freeSlug(base: string, taken: ReadonlySet<string>, rank = 1): string {
  if (rank <= 1 && !taken.has(base)) return base;
  for (let n = Math.max(rank, 2); ; n += 1) {
    const slug = `${base}-${n}`;
    if (!taken.has(slug)) return slug;
  }
}

/** Each MBID's rank among the artists of its name; empty while Musilogy is not loaded. */
async function homonymRanks(mbids: readonly string[]): Promise<Map<string, number>> {
  if (mbids.length === 0) return new Map();
  try {
    const { rows } = await db.execute<{ mbid: string; homonym_rank: number }>(
      sql`SELECT * FROM musilogy.artist_homonym_rank(${`{${mbids.join(',')}}`}::text[])`
    );
    return new Map(rows.map((row) => [row.mbid, row.homonym_rank]));
  } catch (err) {
    // Before the musilogy load that brings it (musilogyService's NOT_LOADED).
    const code = (err as { cause?: { code?: string } }).cause?.code;
    if (code === '42883' || code === '3F000' || code === '42P01') return new Map();
    throw err;
  }
}

/** The slug `name` makes, or null when it has no letter or digit, or one the route refuses. */
function baseOf(name: string): string | null {
  const base = slugify(name);
  return base && isValidArtistSlug(base) ? base : null;
}

/** The slugs held under a base: the base itself and its suffixed forms. */
async function takenUnder(ex: Executor, base: string): Promise<Set<string>> {
  // A slug holds letters, digits and hyphens only: nothing LIKE or the pattern would read as
  // special. The LIKE reads the index (artist_slug_slug_pattern); the pattern keeps `base-N`
  // only, not every slug that merely starts so (`the-…` under `the`).
  const rows = await ex
    .select({ slug: artistSlug.slug })
    .from(artistSlug)
    .where(
      or(
        eq(artistSlug.slug, base),
        and(like(artistSlug.slug, `${base}-%`), sql`${artistSlug.slug} ~ ${`^${base}-[0-9]+$`}`)
      )
    );
  return new Set(rows.map((row) => row.slug));
}

/** Which of these slugs a page already holds. */
async function takenAmong(ex: Executor, slugs: readonly string[]): Promise<Set<string>> {
  if (slugs.length === 0) return new Set();
  const rows = await ex
    .select({ slug: artistSlug.slug })
    .from(artistSlug)
    .where(inArray(artistSlug.slug, [...slugs]));
  return new Set(rows.map((row) => row.slug));
}

function ownedBy(owner: Owner) {
  return 'mbid' in owner
    ? eq(artistSlug.mbid, owner.mbid)
    : eq(artistSlug.artistId, owner.artistId);
}

async function slugOf(ex: Executor, owner: Owner): Promise<string | null> {
  const rows = await ex
    .select({ slug: artistSlug.slug })
    .from(artistSlug)
    .where(ownedBy(owner))
    .limit(1);
  return rows[0]?.slug ?? null;
}

/**
 * Gives a page the first free slug of `name` from the one its rank proposes, or the one it
 * already has. A slug is never taken back nor handed to another page. Null when the name makes
 * none, or for an MBID whose rank Musilogy cannot tell yet (not loaded): its page keeps its MBID
 * until then, rather than take a better known homonym's plain name.
 */
export async function claimSlug(
  ex: Executor,
  owner: Owner,
  name: string,
  rank?: number
): Promise<string | null> {
  const base = baseOf(name);
  if (!base) return slugOf(ex, owner);
  const from = 'mbid' in owner ? (rank ?? (await homonymRanks([owner.mbid])).get(owner.mbid)) : 1;
  if (from === undefined) return slugOf(ex, owner);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const owned = await slugOf(ex, owner);
    if (owned) return owned;
    const slug = freeSlug(base, await takenUnder(ex, base), from);
    if (!isValidArtistSlug(slug)) return null;
    const claimed = await ex
      .insert(artistSlug)
      .values({ slug, ...owner })
      .onConflictDoNothing()
      .returning({ slug: artistSlug.slug });
    if (claimed[0]) return claimed[0].slug;
    // Taken meanwhile by another page, or by this one in a concurrent claim: look again.
  }
  throw new Error(`artist slug: no free slug for "${base}"`);
}

/**
 * When an artist row gets its MBID: the row's own slug becomes the MBID page's when that page
 * has none yet, so the address already shared stays; else the MBID's slug is the page's and the
 * row's answers a 301 there. An MBID page without a slug gets one.
 */
export async function bindArtistSlug(
  ex: Executor,
  artistId: string,
  mbid: string,
  name: string
): Promise<void> {
  if (await slugOf(ex, { mbid })) return;
  const moved = await ex
    .update(artistSlug)
    .set({ mbid, artistId: null })
    .where(and(eq(artistSlug.artistId, artistId), isNull(artistSlug.mbid)))
    .returning({ slug: artistSlug.slug })
    .catch((err: unknown) => {
      // artist_slug_mbid_unique: a concurrent claim gave the MBID its slug first.
      if ((err as { cause?: { code?: string } }).cause?.code === '23505') return [];
      throw err;
    });
  if (moved[0]) return;
  await claimSlug(ex, { mbid }, name);
}

/** The slug of each MBID's page, for those that have one. */
export async function pageSlugs(mbids: readonly string[]): Promise<Map<string, string>> {
  if (mbids.length === 0) return new Map();
  const rows = await db
    .select({ slug: artistSlug.slug, mbid: artistSlug.mbid })
    .from(artistSlug)
    .where(inArray(artistSlug.mbid, [...new Set(mbids)]));
  return new Map(rows.flatMap((row) => (row.mbid ? [[row.mbid, row.slug] as const] : [])));
}

/** What a slug names: an MBID's page, or an artist row's; null for no page. */
export async function ownerOfSlug(slug: string): Promise<Owner | null> {
  const rows = await db
    .select({ mbid: artistSlug.mbid, artistId: artistSlug.artistId })
    .from(artistSlug)
    .where(eq(artistSlug.slug, slug))
    .limit(1);
  const row = rows[0];
  if (row?.mbid) return { mbid: row.mbid };
  if (row?.artistId) return { artistId: row.artistId };
  return null;
}

/** The page slug of an artist row, for the addresses it had before slugs (/artist/<id>/…). */
export async function slugOfArtistPage(id: string): Promise<string | null> {
  const rows = await db
    .select({ slug: pageSlug })
    .from(artist)
    .leftJoin(mbidSlug, eq(mbidSlug.mbid, artist.mbid))
    .leftJoin(ownSlug, eq(ownSlug.artistId, artist.id))
    .where(eq(artist.id, id))
    .limit(1);
  return rows[0]?.slug ?? null;
}

interface Named {
  mbid: string;
  name: string;
}

interface Ranked extends Named {
  rank: number;
}

// The suffixes asked about for each page past the one its rank proposes: a name with more pages
// already than these goes to claimSlug, which reads all of them.
const SUFFIXES_ASKED = 4;

/** The slugs asked about for some pages: each one's proposal and the few after it. */
export function candidatesOf(pages: readonly Ranked[]): string[] {
  const asked = new Set<string>();
  for (const page of pages) {
    const base = baseOf(page.name);
    if (!base) continue;
    if (page.rank <= 1) asked.add(base);
    const from = Math.max(page.rank, 2);
    for (let n = from; n < from + SUFFIXES_ASKED; n += 1) asked.add(`${base}-${n}`);
  }
  return [...asked];
}

/**
 * The slugs some pages get, from each one's proposal. `asked` are the slugs looked up, `taken`
 * those of them a page holds, which gains what is given. A page whose free slug lies past what
 * was asked is `deferred`; a name that makes none is left.
 */
export function planSlugs(
  pages: readonly Ranked[],
  asked: ReadonlySet<string>,
  taken: Set<string>
): { planned: Array<{ mbid: string; slug: string }>; deferred: Ranked[] } {
  const planned: Array<{ mbid: string; slug: string }> = [];
  const deferred: Ranked[] = [];
  for (const page of pages) {
    const base = baseOf(page.name);
    if (!base) continue;
    const slug = freeSlug(base, taken, page.rank);
    if (!asked.has(slug)) deferred.push(page);
    else if (isValidArtistSlug(slug)) {
      taken.add(slug);
      planned.push({ mbid: page.mbid, slug });
    }
  }
  return { planned, deferred };
}

/**
 * The slug of each of these pages, giving one to those published here for the first time: the
 * links a page draws, a search's hits, a page served by its MBID. Three queries for the new ones
 * (their ranks, the slugs they would take, the writing), one at a time only for the rare page
 * whose name many pages share already. A page Musilogy cannot rank yet is left at its MBID.
 */
export async function slugsFor(pages: readonly Named[]): Promise<Map<string, string>> {
  const slugs = await pageSlugs(pages.map((page) => page.mbid));
  const fresh = [
    ...new Map(pages.filter((p) => !slugs.has(p.mbid)).map((p) => [p.mbid, p])).values(),
  ];
  if (fresh.length === 0) return slugs;
  const ranks = await homonymRanks(fresh.map((page) => page.mbid));
  const ranked = fresh.flatMap((page) => {
    const rank = ranks.get(page.mbid);
    return rank === undefined ? [] : [{ ...page, rank }];
  });
  const asked = candidatesOf(ranked);
  const { planned, deferred } = planSlugs(ranked, new Set(asked), await takenAmong(db, asked));
  const written =
    planned.length === 0
      ? []
      : await db
          .insert(artistSlug)
          .values(planned)
          .onConflictDoNothing()
          .returning({ mbid: artistSlug.mbid, slug: artistSlug.slug });
  for (const row of written) if (row.mbid) slugs.set(row.mbid, row.slug);
  // Past what was asked, or taken meanwhile by a concurrent publication: one at a time.
  const missed = new Set(planned.flatMap((p) => (slugs.has(p.mbid) ? [] : [p.mbid])));
  for (const page of [...deferred, ...ranked.filter((p) => missed.has(p.mbid))]) {
    const slug = await claimSlug(db, { mbid: page.mbid }, page.name, page.rank);
    if (slug) slugs.set(page.mbid, slug);
  }
  return slugs;
}
