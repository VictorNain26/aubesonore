import { and, eq, isNull, like, max } from 'drizzle-orm';
import { coverArtUrl } from '@aubesonore/shared-types/client';
import { db, schema } from '../db/index';
import { bareTitle, comparableName, primaryArtistName, sameTitle } from '../lib/artistName';
import { logger } from '../lib/logger';
import type { Lookup } from '../lib/lookup';
import { coverStore, type FillOutcome } from './coverStore';
import { isDaytime } from './coverFill';
import { findRecordingReleases, type RecordingOnReleases } from './musicbrainzService';

/**
 * A kept track's cover is the Cover Art Archive's front cover of its record, served from the cover
 * store (/covers/caa/<release group>/, coverStore.ts) and stored in `liked_tracks.artwork_url` as
 * the archive's address (`coverArtUrl`), which the frontend maps to the store. Never Apple's (the
 * iTunes Search API's terms keep its art for store promotion beside a store badge) nor the
 * antenna's (the pipeline embeds Deezer's): no record found, or no cover for it, is no artwork,
 * and the listener sees the cover's glyph.
 */

export interface KeptTrackRef {
  title: string;
  artist: string;
  /** The play's ISRC (linkKeptTrack), checked against title and name like the resolver's. */
  isrc: string | null;
}

interface FinderDeps {
  search: typeof findRecordingReleases;
  fill: (releaseGroup: string) => Promise<FillOutcome>;
}

// A recording on many records (a hit on compilations is not, they are left out) is tried on its
// first few only: each try is one fetch of the archive.
const MAX_RECORDS = 3;

/** The same song exactly, versions aside: a search answers any title containing the words. */
function exactTitle(kept: string, other: string): boolean {
  return comparableName(bareTitle(kept)) === comparableName(bareTitle(other));
}

/**
 * The recordings of the kept title credited under the kept name, when they credit one artist of
 * that name only: two homonyms, and none of them is the artist for sure (« Never bind by name
 * alone », .claude/rules/site.md).
 */
function matching(
  recordings: readonly RecordingOnReleases[],
  track: KeptTrackRef,
  same: (kept: string, other: string) => boolean
): RecordingOnReleases[] {
  const name = comparableName(primaryArtistName(track.artist));
  const creditedOf = (recording: RecordingOnReleases) =>
    recording.credits.filter((credit) => credit.names.some((n) => comparableName(n) === name));
  const kept = recordings.filter(
    (recording) => same(track.title, recording.title) && creditedOf(recording).length > 0
  );
  const artists = new Set(kept.flatMap((recording) => creditedOf(recording).map((c) => c.mbid)));
  return artists.size === 1 ? kept : [];
}

/** The artist's own official records of these recordings, the earliest first. */
function recordsOf(recordings: readonly RecordingOnReleases[]): string[] {
  const firstDate = new Map<string, string>();
  for (const { releases } of recordings) {
    for (const release of releases) {
      if (!release.official || release.secondaryTypes.length > 0) continue;
      // Undated sorts after any date.
      const date = release.date ?? '9999';
      const known = firstDate.get(release.releaseGroup);
      if (known === undefined || date < known) firstDate.set(release.releaseGroup, date);
    }
  }
  return [...firstDate.entries()]
    .sort(([, a], [, b]) => a.localeCompare(b))
    .map(([releaseGroup]) => releaseGroup);
}

export function createCoverFinder({ search, fill }: FinderDeps) {
  /** The kept track's recordings: by its ISRC when MusicBrainz files it on this track, else by title. */
  async function recordingsOf(track: KeptTrackRef): Promise<Lookup<RecordingOnReleases[]>> {
    if (track.isrc) {
      const byIsrc = await search({ isrc: track.isrc });
      if (byIsrc.status === 'failed') return byIsrc;
      const kept = byIsrc.status === 'found' ? matching(byIsrc.value, track, sameTitle) : [];
      if (kept.length > 0) return { status: 'found', value: kept };
    }
    const title = bareTitle(track.title);
    if (title === '') return { status: 'none' };
    const byTitle = await search({ name: primaryArtistName(track.artist), title });
    if (byTitle.status !== 'found') return byTitle;
    const kept = matching(byTitle.value, track, exactTitle);
    return kept.length > 0 ? { status: 'found', value: kept } : { status: 'none' };
  }

  /** The archive's address of the cover; none when no record of it has one. */
  return async function findKeptTrackCover(track: KeptTrackRef): Promise<Lookup<string>> {
    const recordings = await recordingsOf(track);
    if (recordings.status !== 'found') return recordings;
    for (const releaseGroup of recordsOf(recordings.value).slice(0, MAX_RECORDS)) {
      const outcome = await fill(releaseGroup);
      if (outcome === 'stored' || outcome === 'present')
        return { status: 'found', value: coverArtUrl(releaseGroup, 500) };
      if (outcome === 'failed') return { status: 'failed' };
      // Taken down on request: no other edition's cover stands in for it.
      if (outcome === 'blocked') return { status: 'none' };
    }
    return { status: 'none' };
  };
}

export const findKeptTrackCover = createCoverFinder({
  search: findRecordingReleases,
  fill: (releaseGroup) => coverStore.fillReleaseGroup(releaseGroup),
});

// ── The rows ─────────────────────────────────

const CAA_COVER = 'https://coverartarchive.org/release-group/%';
const RELEASE_GROUP_OF =
  /^https:\/\/coverartarchive\.org\/release-group\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/front-500$/;

/** The cover another listener's copy of this track already has. */
export async function storedCover(title: string, artist: string): Promise<string | null> {
  const [row] = await db
    .select({ artworkUrl: schema.likedTracks.artworkUrl })
    .from(schema.likedTracks)
    .where(
      and(
        eq(schema.likedTracks.title, title),
        eq(schema.likedTracks.artist, artist),
        like(schema.likedTracks.artworkUrl, CAA_COVER)
      )
    )
    .limit(1);
  return row?.artworkUrl ?? null;
}

/** The release group of the cover a kept copy of this track has (the share page's). */
export async function storedReleaseGroup(title: string, artist: string): Promise<string | null> {
  const cover = await storedCover(title, artist);
  return (cover && RELEASE_GROUP_OF.exec(cover)?.[1]) ?? null;
}

/** Every listener's copy of the track still without a cover takes this one. */
async function writeCover(title: string, artist: string, artworkUrl: string): Promise<void> {
  await db
    .update(schema.likedTracks)
    .set({ artworkUrl })
    .where(
      and(
        eq(schema.likedTracks.title, title),
        eq(schema.likedTracks.artist, artist),
        isNull(schema.likedTracks.artworkUrl)
      )
    );
}

export type CoverOutcome = 'copied' | 'found' | 'none' | 'failed';

interface CoverDeps {
  stored: (title: string, artist: string) => Promise<string | null>;
  find: (track: KeptTrackRef) => Promise<Lookup<string>>;
  write: (title: string, artist: string, artworkUrl: string) => Promise<void>;
}

/** A kept track's cover, copied from another copy of it, else looked up; written when found. */
export async function coverTrack(
  track: KeptTrackRef,
  deps: CoverDeps = { stored: storedCover, find: findKeptTrackCover, write: writeCover }
): Promise<CoverOutcome> {
  const stored = await deps.stored(track.title, track.artist);
  if (stored) {
    await deps.write(track.title, track.artist, stored);
    return 'copied';
  }
  const found = await deps.find(track);
  if (found.status !== 'found') return found.status;
  await deps.write(track.title, track.artist, found.value);
  return 'found';
}

/** The kept track just kept, once tied to its play (its ISRC): its cover. */
export async function coverKeptTrack(trackId: string): Promise<void> {
  const [row] = await db
    .select({
      title: schema.likedTracks.title,
      artist: schema.likedTracks.artist,
      isrc: schema.likedTracks.isrc,
      artworkUrl: schema.likedTracks.artworkUrl,
    })
    .from(schema.likedTracks)
    .where(eq(schema.likedTracks.id, trackId))
    .limit(1);
  if (!row || row.artworkUrl) return;
  await coverTrack(row);
}

// ── The pass ─────────────────────────────────

/** Each kept track without a cover once, whoever kept it, with an ISRC one of its copies has. */
export async function tracksWithoutCover(): Promise<KeptTrackRef[]> {
  return db
    .select({
      title: schema.likedTracks.title,
      artist: schema.likedTracks.artist,
      isrc: max(schema.likedTracks.isrc),
    })
    .from(schema.likedTracks)
    .where(isNull(schema.likedTracks.artworkUrl))
    .groupBy(schema.likedTracks.title, schema.likedTracks.artist);
}

interface FillDeps {
  tracks: () => Promise<KeptTrackRef[]>;
  cover: (track: KeptTrackRef) => Promise<CoverOutcome>;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
}

const PAUSE_MS = 1000;
const NIGHT_CHECK_MS = 10 * 60 * 1000;

/**
 * The kept tracks without a cover, one at a time: those whose Apple cover or copy of the antenna's
 * art was dropped (migration 0024), and those MusicBrainz or the archive failed at their keeping. A second's pause after
 * each one MusicBrainz was asked about leaves the live pages its other slots (one request a
 * second, musicbrainzService). By day only, like coverFill.
 */
export function createKeptCoverFill(deps: FillDeps) {
  return {
    async runPass(): Promise<Record<CoverOutcome, number>> {
      const tally: Record<CoverOutcome, number> = { copied: 0, found: 0, none: 0, failed: 0 };
      for (const track of await deps.tracks()) {
        while (!isDaytime(deps.now())) await deps.sleep(NIGHT_CHECK_MS);
        const outcome = await deps.cover(track);
        tally[outcome]++;
        if (outcome !== 'copied') await deps.sleep(PAUSE_MS);
      }
      return tally;
    },
  };
}

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms).unref?.();
  });

const FIRST_PASS_AFTER_MS = 60 * 1000;
const PASS_EVERY_MS = 24 * 60 * 60 * 1000;

/** A pass a minute after start, then daily. */
export function startKeptCoverFill(): void {
  const fill = createKeptCoverFill({
    tracks: tracksWithoutCover,
    cover: (track) => coverTrack(track),
    now: Date.now,
    sleep,
  });
  void (async () => {
    await sleep(FIRST_PASS_AFTER_MS);
    for (;;) {
      try {
        logger.info('keptCoverFill.done', await fill.runPass());
      } catch (err) {
        logger.warn('keptCoverFill.failed', { message: (err as Error).message });
      }
      await sleep(PASS_EVERY_MS);
    }
  })();
}
