import { lt } from 'drizzle-orm';
import { db, schema } from '../../db/index';

/**
 * Periodically delete sessions and verification rows past their expires_at.
 * Better Auth never purges its own tables, so unbounded growth is the default.
 */
export async function purgeExpiredAuthRows(): Promise<{ sessions: number; verifications: number }> {
  const now = new Date();
  const sessionsResult = await db
    .delete(schema.session)
    .where(lt(schema.session.expiresAt, now))
    .returning({ id: schema.session.id });
  const verificationsResult = await db
    .delete(schema.verification)
    .where(lt(schema.verification.expiresAt, now))
    .returning({ id: schema.verification.id });
  return {
    sessions: sessionsResult.length,
    verifications: verificationsResult.length,
  };
}
