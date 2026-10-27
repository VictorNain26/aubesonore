import { sql } from 'drizzle-orm';
import { db } from '../db';
import { logger } from '../lib/logger';
import type { CoverStore } from './coverStore';

/**
 * Moves the kept tracks' covers out of the `covers` table, where they were stored as bytes, into
 * the cover store (coverStore.ts), run at boot before the migrations. Every cover's original bytes
 * are written to the store and read back identical first, one at a time; only then, in one
 * transaction, are the tracks pointed at the store's addresses and the rows deleted. If any file
 * cannot be written, the database is left as it was: migration 0023 then refuses to drop the
 * table, the boot stops and the deploy goes back to the previous version (scripts/deploy.sh),
 * which still serves every track's old address. No kept cover is ever lost. Run again, it
 * finds only what is left.
 */
export async function moveKeptCovers(
  store: Pick<CoverStore, 'keepOriginal' | 'keptUrl'>
): Promise<{ moved: number; failed: number }> {
  const tally = { moved: 0, failed: 0 };
  const { rows: table } = await db.execute<{ t: string | null }>(
    sql`SELECT to_regclass('public.covers')::text AS t`
  );
  if (!table[0]?.t) return tally;

  const { rows } = await db.execute<{ sha256: string }>(
    sql`SELECT sha256 FROM covers ORDER BY sha256`
  );
  for (const { sha256 } of rows) {
    try {
      // One cover's bytes in memory at a time (2 MB at most, coverService kept no more).
      const { rows: cover } = await db.execute<{ bytes: Buffer }>(
        sql`SELECT bytes FROM covers WHERE sha256 = ${sha256}`
      );
      const bytes = cover[0]?.bytes;
      if (!bytes || !(await store.keepOriginal(sha256, bytes))) throw new Error('not kept');
    } catch (err) {
      tally.failed++;
      logger.error('keptCovers.not_moved', { sha256, message: (err as Error).message });
    }
  }
  if (tally.failed > 0) return tally;

  await db.transaction(async (tx) => {
    for (const { sha256 } of rows) {
      await tx.execute(sql`
        UPDATE liked_tracks SET artwork_url = ${store.keptUrl(sha256)}
        WHERE artwork_url LIKE ${`%/api/covers/${sha256}`}`);
      await tx.execute(sql`DELETE FROM covers WHERE sha256 = ${sha256}`);
    }
  });
  tally.moved = rows.length;
  if (tally.moved > 0) logger.info('keptCovers.moved', tally);
  return tally;
}
