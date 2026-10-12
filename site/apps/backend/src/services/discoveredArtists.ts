import type { MusilogyArtist, MusilogyArtistRef } from '@aubesonore/shared-types/client';
import { logger } from '../lib/logger';
import { listPlayedMbids } from './artistPages';
import { getArtistIdentity, getMusilogyArtist } from './musilogyService';

/**
 * Which pages of artists the antenna never played are offered to search engines
 * (docs/vision.md §2.4): linked from at least 2 played pages, with a Wikidata
 * item (the way to their Wikipedia opening) and at least 3 albums or EPs.
 * Measured on 2026-10-12, once a page links its 8 artists of the same sound
 * rather than dozens of neighbours: the 479 played pages link to 4,406 artists
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

// Empty until the first run: a page stays out of search results until it is shown to qualify.
let discovered: ReadonlySet<string> = new Set();

export function isDiscovered(mbid: string | null): boolean {
  return mbid !== null && discovered.has(mbid);
}

/** The qualifying MBIDs, sorted: the discovered artists' sitemap. */
export function listDiscovered(): string[] {
  return [...discovered].sort();
}

/** Every artist a page links to: close artists, bands, projects, other names. */
function linkedArtists(page: MusilogyArtist): MusilogyArtistRef[] {
  const { neighbours, bands } = page;
  return [
    ...(neighbours ?? []),
    ...(bands ? [...bands.members, ...bands.groups] : []),
    ...(page.memberProjects ?? []),
    ...(page.otherNames ?? []),
  ];
}

/** How many played pages link to each artist never played. */
async function playedLinks(): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  // One at a time: a run reads ~900 artists, the site's database serves pages meanwhile.
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

async function qualifies(mbid: string): Promise<boolean> {
  const identity = await getArtistIdentity(mbid);
  if (!identity?.wikidataId) return false;
  const page = await getMusilogyArtist(mbid);
  return (page?.releases?.length ?? 0) >= MIN_RECORDS;
}

/** Recomputes the set; a failed run keeps the previous one. */
export async function refreshDiscovered(): Promise<void> {
  const links = await playedLinks();
  const next = new Set<string>();
  for (const [mbid, count] of links) {
    if (count >= MIN_PLAYED_LINKS && (await qualifies(mbid))) next.add(mbid);
  }
  discovered = next;
  logger.info('discoveredArtists.refreshed', { linked: links.size, discovered: next.size });
}

/** Computes the set a minute after start, then every day. */
export function startDiscoveredArtists(): () => void {
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
