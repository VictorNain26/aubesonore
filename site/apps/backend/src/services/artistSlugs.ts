import { and, eq, inArray, isNull, like, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db } from '../db';
import { connectLong } from '../db/long';
import { artist, artistSlug } from '../db/schema';
import { slugify } from '../lib/artistName';
import { logger } from '../lib/logger';
import { isValidArtistSlug } from '../validators/artistValidator';

/**
 * Every artist page has one address, its slug (docs/vision.md §5): the page of an MBID is named
 * by it, whether the antenna played the artist or not; a played artist without an MBID, which
 * Musilogy cannot know, by its row. The slug of a row whose artist has an MBID since is an older
 * address of that MBID's page, which answers a 301 there.
 */
type Owner = { mbid: string } | { artistId: string };
type Executor = Pick<typeof db, 'select' | 'insert' | 'update'>;

/** The page slug of an artist row: its MBID's when it has one, else its own. */
export const mbidSlug = alias(artistSlug, 'mbid_slug');
export const ownSlug = alias(artistSlug, 'own_slug');
export const pageSlug = sql<string | null>`coalesce(${mbidSlug.slug}, ${ownSlug.slug})`;

/** The first of `base`, `base-2`, `base-3`… that no page holds. */
export function freeSlug(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  for (let n = 2; ; n += 1) {
    const slug = `${base}-${n}`;
    if (!taken.has(slug)) return slug;
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
 * Gives a page the first free slug of `name` (`cassius`, `cassius-2`…), or the one it already
 * has. A slug is never taken back nor handed to another page. Null when the name makes none.
 */
export async function claimSlug(ex: Executor, owner: Owner, name: string): Promise<string | null> {
  const base = baseOf(name);
  if (!base) return slugOf(ex, owner);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const owned = await slugOf(ex, owner);
    if (owned) return owned;
    const slug = freeSlug(base, await takenUnder(ex, base));
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

// The suffixes a batch asks about for each name, beyond its homonyms in the batch: a name with
// more pages already than these goes to claimSlug, which reads all of them.
const SUFFIXES_ASKED = 4;

/** The slugs a batch asks about: each name alone and its first suffixes. */
export function candidatesOf(pages: readonly Named[]): string[] {
  const count = new Map<string, number>();
  for (const page of pages) {
    const base = baseOf(page.name);
    if (base) count.set(base, (count.get(base) ?? 0) + 1);
  }
  return [...count].flatMap(([base, n]) => [
    base,
    ...Array.from({ length: n + SUFFIXES_ASKED }, (_, i) => `${base}-${i + 2}`),
  ]);
}

/**
 * The slugs a batch gives, in the order given: the first of homonyms takes the plain name.
 * `asked` are the slugs looked up, `taken` those of them a page holds, which gains what is given.
 * A page whose free slug lies past what was asked is `deferred`; a name that makes none is left.
 */
export function planSlugs(
  pages: readonly Named[],
  asked: ReadonlySet<string>,
  taken: Set<string>
): { planned: Array<{ mbid: string; slug: string }>; deferred: Named[] } {
  const planned: Array<{ mbid: string; slug: string }> = [];
  const deferred: Named[] = [];
  for (const page of pages) {
    const base = baseOf(page.name);
    if (!base) continue;
    const slug = freeSlug(base, taken);
    if (!asked.has(slug)) deferred.push(page);
    else if (isValidArtistSlug(slug)) {
      taken.add(slug);
      planned.push({ mbid: page.mbid, slug });
    }
  }
  return { planned, deferred };
}

const BATCH = 2_000;

/**
 * Gives every artist Musilogy knows its slug, once (docs/vision.md §5): the MBIDs without one,
 * the most listened first (musilogy.artist_index), so among homonyms the best known takes the
 * plain name. On a connection of its own: the list takes longer than the pool's timeouts allow.
 */
export async function assignSlugs(): Promise<{ given: number; nameless: number }> {
  const client = await connectLong();
  let given = 0;
  let nameless = 0;
  try {
    await client.query('BEGIN');
    // WITH HOLD keeps the list past the commit, so no transaction stays open while the slugs
    // are written; an MBID the antenna gives a slug meanwhile is skipped by the conflict.
    await client.query(`
      DECLARE pages NO SCROLL CURSOR WITH HOLD FOR
        SELECT i.mbid, i.name FROM musilogy.artist_index() i
        WHERE NOT EXISTS (SELECT 1 FROM artist_slug s WHERE s.mbid = i.mbid)
        ORDER BY i.user_count DESC NULLS LAST, i.mbid`);
    await client.query('COMMIT');
    for (;;) {
      const { rows } = await client.query<Named>(`FETCH ${BATCH} FROM pages`);
      if (rows.length === 0) break;
      const asked = candidatesOf(rows);
      const { planned, deferred } = planSlugs(rows, new Set(asked), await takenAmong(db, asked));
      nameless += rows.length - planned.length - deferred.length;
      const written =
        planned.length === 0
          ? []
          : await db
              .insert(artistSlug)
              .values(planned)
              .onConflictDoNothing()
              .returning({ mbid: artistSlug.mbid });
      given += written.length;
      // A name with many pages already, or a slug the antenna claimed meanwhile: one at a time.
      const done = new Set(written.map((row) => row.mbid));
      const missed = new Set(planned.flatMap((p) => (done.has(p.mbid) ? [] : [p.mbid])));
      for (const page of [...deferred, ...rows.filter((row) => missed.has(row.mbid))]) {
        if (await claimSlug(db, { mbid: page.mbid }, page.name)) given += 1;
      }
    }
    await client.query('CLOSE pages');
  } finally {
    await client.end();
  }
  logger.info('artist_slugs.assigned', { given, nameless });
  return { given, nameless };
}
