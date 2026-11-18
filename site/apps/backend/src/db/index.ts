import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { env } from '../config/env';
import * as schema from './schema';

// TLS is verified against the stack's CA; config/env refuses TLS without one.
const sslConfig = env.DATABASE_SSL ? { rejectUnauthorized: true, ca: env.DATABASE_CA_CERT } : false;

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: env.DATABASE_POOL_MAX,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  // Kill any single query that exceeds 5s server-side, abort client-side at 10s.
  // Without these a hung query (network blip, lock contention, bad plan) would
  // hold a pool slot indefinitely and exhaust the pool under load.
  statement_timeout: 5_000,
  query_timeout: 10_000,
  ssl: sslConfig,
});

/**
 * Applies the migrations drizzle-kit generated from schema.ts (../../drizzle) that the database
 * has not run. On their own connection, without the 5 s limit: an index build or a backfill can
 * take minutes. lock_timeout makes one that waits on a lock (a dump, a Musilogy load) fail and
 * retry at the next boot rather than hold the boot indefinitely.
 */
export async function migrateDatabase(): Promise<void> {
  const migrations = new Pool({
    connectionString: env.DATABASE_URL,
    max: 1,
    connectionTimeoutMillis: 5_000,
    lock_timeout: 30_000,
    ssl: sslConfig,
  });
  try {
    await migrate(drizzle(migrations), {
      migrationsFolder: fileURLToPath(new URL('../../drizzle', import.meta.url)),
    });
  } finally {
    await migrations.end();
  }
}

export const db = drizzle(pool, { schema });
export { schema };
