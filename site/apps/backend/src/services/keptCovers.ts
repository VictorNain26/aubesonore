import { sql } from 'drizzle-orm';
import { db } from '../db';
import { logger } from '../lib/logger';
import type { CoverStore } from './coverStore';

/**
 * Moves the kept tracks' covers out of the `covers` table, where they were stored as bytes, into
 * the cover store (coverStore.ts), run at boot before the migrations. One cover at a time: its
 * original bytes written to the store and read back identical, then, in one transaction, its
 * tracks pointed at the store's address and its row deleted. A cover whose file cannot be written
 * keeps its row and its tracks' address; migration 0023 then refuses to drop the table, the boot
 * stops and the deploy goes back to the previous version (scripts/deploy.sh): no kept cover is
 * ever lost. Run again, it finds only what is left.
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
      await db.transaction(async (tx) => {
        await tx.execute(sql`
          UPDATE liked_tracks SET artwork_url = ${store.keptUrl(sha256)}
          WHERE artwork_url LIKE ${`%/api/covers/${sha256}`}`);
        await tx.execute(sql`DELETE FROM covers WHERE sha256 = ${sha256}`);
      });
      tally.moved++;
    } catch (err) {
      tally.failed++;
      logger.error('keptCovers.not_moved', { sha256, message: (err as Error).message });
    }
  }
  if (tally.moved > 0 || tally.failed > 0) logger.info('keptCovers.moved', tally);
  return tally;
}
