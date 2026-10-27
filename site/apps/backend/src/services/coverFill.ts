import { logger } from '../lib/logger';
import { listPlayedMbids } from './artistPages';
import { coverStore, type FillOutcome } from './coverStore';
import { listDiscovered } from './discoveredArtists';
import { listReleaseGroupIds } from './musilogyService';

/**
 * The records' covers stored ahead of the pages that show them, so a listener opening an artist
 * page never waits on the Cover Art Archive (25 % of album covers took 1.8 to 3 s at first view,
 * 2026-10-27). Every record of the indexed pages, the played artists' and the discovered ones'
 * (discoveredArtists.ts), as Musilogy lists them (artist_releases): one fetch of the archive's
 * 500 px thumbnail each, made into 250 and 500 (coverStore.ts).
 *
 * Polite to the archive: one record at a time, a second's pause after each one it was asked
 * about. By day only, from 08:00 to 23:00 in Paris: no work is scheduled at night (the owner's
 * rule). A pass stopped by the night goes on in the morning where it was;
 * a record already stored, or known missing for the day, costs the archive nothing.
 * About 16,000 records (2026-10-27) at 2.4 to 4.1 s each: the first pass takes one or two days.
 */
const DAY_STARTS = 8;
const DAY_ENDS = 23;
const PAUSE_MS = 1000;
const NIGHT_CHECK_MS = 10 * 60 * 1000;
const FIRST_PASS_AFTER_MS = 2 * 60 * 1000;
const PASS_EVERY_MS = 24 * 60 * 60 * 1000;

const parisHour = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Paris',
  hour: 'numeric',
  hourCycle: 'h23',
});

export function isDaytime(at: number): boolean {
  const hour = Number(parisHour.format(at));
  return hour >= DAY_STARTS && hour < DAY_ENDS;
}

interface FillDeps {
  releaseGroups: () => Promise<string[]>;
  fill: (releaseGroup: string) => Promise<FillOutcome>;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
}

// Asked of the archive: a pause follows. Already stored or known missing: none.
const ASKED: ReadonlySet<FillOutcome> = new Set(['stored', 'missing', 'failed']);

export function createCoverFill(deps: FillDeps) {
  return {
    /** Every record once, by day; what became of them. */
    async runPass(): Promise<Record<FillOutcome, number>> {
      const tally: Record<FillOutcome, number> = {
        present: 0,
        'known-missing': 0,
        stored: 0,
        missing: 0,
        failed: 0,
        blocked: 0,
      };
      for (const releaseGroup of await deps.releaseGroups()) {
        while (!isDaytime(deps.now())) await deps.sleep(NIGHT_CHECK_MS);
        const outcome = await deps.fill(releaseGroup);
        tally[outcome]++;
        if (ASKED.has(outcome)) await deps.sleep(PAUSE_MS);
      }
      return tally;
    },
  };
}

/** The records of the indexed pages, each once: the played artists' first. */
async function indexedReleaseGroups(): Promise<string[]> {
  const ids = new Set<string>();
  for (const mbid of [...(await listPlayedMbids()), ...listDiscovered()]) {
    // One artist at a time: the site's database serves pages meanwhile.
    for (const id of (await listReleaseGroupIds(mbid)) ?? []) ids.add(id);
  }
  return [...ids];
}

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms).unref?.();
  });

/** A first pass two minutes after start (the discovered set is read back by then), then daily. */
export function startCoverFill(): void {
  const fill = createCoverFill({
    releaseGroups: indexedReleaseGroups,
    fill: (id) => coverStore.fillReleaseGroup(id),
    now: Date.now,
    sleep,
  });
  void (async () => {
    await sleep(FIRST_PASS_AFTER_MS);
    for (;;) {
      try {
        logger.info('coverFill.done', await fill.runPass());
      } catch (err) {
        logger.warn('coverFill.failed', { message: (err as Error).message });
      }
      await sleep(PASS_EVERY_MS);
    }
  })();
}
