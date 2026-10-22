import type { MusilogyArtist, MusilogyArtistRef } from '@aubesonore/shared-types/client';
import { db } from '../db';
import { discoveredArtist } from '../db/schema';
import { logger } from '../lib/logger';
import { listPlayedMbids } from './artistPages';
import { pageSlugs, slugsFor } from './artistSlugs';
import { getArtistIdentity, getMusilogyArtist } from './musilogyService';

/**
 * Which pages of artists the antenna never played are offered to search engines
 * (docs/vision.md §2.4): linked from at least 2 played pages, with a Wikidata
 * item (the way to their Wikipedia opening) and at least 3 albums or EPs.
 * Measured on 2026-10-12, once a page links its 8 artists of the same sound
 * (besides its members, their projects and its other names) rather than dozens
 * of neighbours: the 479 played pages link to 4,406 artists
 * never played, 617 from at least 2 pages, 474 pass; at 10 links, the rule of
 * 2026-10-06, 5 passed. All 25 of a random sample at exactly 2 links had a
 * Wikipedia opening (The Cranberries, Gorillaz, Erykah Badu…). Google's spam
 * policies count pages stitched from other sites at scale as abuse; these sit
 * in the radio's own graph.
 * https://developers.google.com/search/docs/essentials/spam-policies
 */
export const MIN_PLAYED_LINKS = 2;
const MIN_RECORDS = 3;

const REFRESH_EVERY_MS = 24 * 60 * 60 * 1000;
const FIRST_RUN_AFTER_MS = 60_000;

// Read back from the database at start, then recomputed: a page stays out of search results until
// it is shown to qualify.
let discovered: ReadonlySet<string> = new Set();

export function isDiscovered(mbid: string | null): boolean {
  return mbid !== null && discovered.has(mbid);
}

/** The qualifying MBIDs, sorted: the discovered artists' sitemap. */
export function listDiscovered(): string[] {
  return [...discovered].sort();
}

/** Every artist a page links to: its three tabs of close artists, bands, projects, other names. */
function linkedArtists(page: MusilogyArtist): MusilogyArtistRef[] {
  const { sameSound, colisten, credits, bands } = page;
  return [
    ...(sameSound ?? []),
    ...(colisten ?? []),
    ...(credits ?? []),
    ...(bands ? [...bands.members, ...bands.groups] : []),
    ...(page.memberProjects ?? []),
    ...(page.otherNames ?? []),
  ];
}

/** How many played pages link to each artist never played. */
async function playedLinks(): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  // One at a time: a run reads ~1,100 artists, the site's database serves pages meanwhile.
  for (const mbid of await listPlayedMbids()) {
    const page = await getMusilogyArtist(mbid);
    if (!page) continue;
    const unplayed = new Set(
      linkedArtists(page)
        .filter((ref) => ref.played === null)
        .map((ref) => ref.mbid)
    );
    for (const ref of unplayed) counts.set(ref, (counts.get(ref) ?? 0) + 1);
  }
  return counts;
}

/** The artist's name when it qualifies, else null. */
async function qualifies(mbid: string): Promise<string | null> {
  const identity = await getArtistIdentity(mbid);
  return identity !== null && identity.wikidataId !== null && identity.records >= MIN_RECORDS
    ? identity.name
    : null;
}

/** Recomputes the set; a failed run keeps the previous one. */
export async function refreshDiscovered(): Promise<void> {
  const links = await playedLinks();
  const named: Array<{ mbid: string; name: string }> = [];
  for (const [mbid, count] of links) {
    const name = count >= MIN_PLAYED_LINKS ? await qualifies(mbid) : null;
    if (name !== null) named.push({ mbid, name });
  }
  const next = new Set(named.map((page) => page.mbid));
  // The sitemap publishes their addresses: each has its slug from now on.
  await slugsFor(named);
  await db.transaction(async (tx) => {
    await tx.delete(discoveredArtist);
    if (next.size > 0)
      await tx.insert(discoveredArtist).values([...next].map((mbid) => ({ mbid })));
  });
  discovered = next;
  logger.info('discoveredArtists.refreshed', { linked: links.size, discovered: next.size });
}

/** The discovered pages' addresses, sorted: their slug, else their MBID. */
export async function listDiscoveredPages(): Promise<string[]> {
  const mbids = listDiscovered();
  const slugs = await pageSlugs(mbids);
  return mbids.map((mbid) => slugs.get(mbid) ?? mbid).sort();
}

/** The set the last run stored: what a restart serves until the next run. */
export async function loadDiscovered(): Promise<void> {
  const rows = await db.select({ mbid: discoveredArtist.mbid }).from(discoveredArtist);
  discovered = new Set(rows.map((row) => row.mbid));
}

/** Reads the stored set at once, computes it again a minute after start, then every day. */
export function startDiscoveredArtists(): () => void {
  loadDiscovered().catch((err: unknown) => {
    logger.warn('discoveredArtists.load_failed', { message: (err as Error).message });
  });
  const tick = () => {
    refreshDiscovered().catch((err: unknown) => {
      logger.warn('discoveredArtists.refresh_failed', { message: (err as Error).message });
    });
  };
  const first = setTimeout(tick, FIRST_RUN_AFTER_MS);
  const every = setInterval(tick, REFRESH_EVERY_MS);
  first.unref?.();
  every.unref?.();
  return () => {
    clearTimeout(first);
    clearInterval(every);
  };
}
