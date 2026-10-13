import { readdirSync, readFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import type { Pool } from 'pg';
import { logger } from '../lib/logger';

const MIGRATIONS_TABLE = '__app_migrations';

// Fixed bigint key for pg_advisory_lock. Two backend instances booting at the
// same time (rolling deploy, autoscale) would otherwise race on the migration
// table — one would commit, the other might re-execute a non-idempotent step.
// The lock serialises them: the second instance waits, finds the table
// up-to-date, and exits the runner immediately.
const MIGRATION_LOCK_KEY = 727823746;

// Migrations already applied in production before this runner existed. The runner
// records them as applied on first boot WITHOUT executing them — they are
// historical Drizzle-generated files that are NOT idempotent and would fail
// if rerun against an existing schema.
//
// Any migration NOT in this list will be executed (in lexicographic order)
// if it hasn't been recorded yet. New migrations from this point on MUST be
// written as idempotent SQL (CREATE ... IF NOT EXISTS, DROP ... IF EXISTS,
// ALTER ... ADD COLUMN IF NOT EXISTS, etc.).
const BASELINE_MIGRATIONS = new Set([
  '0000_kind_lake',
  '0001_lethal_liz_osborn',
  '0002_perf_indexes',
  '0003_drop_artwork_base64',
]);

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(here, '..', '..', 'drizzle');

interface MigrationFile {
  name: string;
  path: string;
}

function listMigrations(): MigrationFile[] {
  const entries = readdirSync(MIGRATIONS_DIR, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && e.name.endsWith('.sql'))
    .map((e) => ({ name: e.name.replace(/\.sql$/, ''), path: join(MIGRATIONS_DIR, e.name) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function runMigrations(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    // Session-level advisory lock — released when the connection closes.
    // Serialises concurrent boots so only one process applies migrations
    // at a time.
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_KEY]);
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
          name text PRIMARY KEY,
          applied_at timestamptz NOT NULL DEFAULT now()
        )
      `);

      const { rows: applied } = await client.query<{ name: string }>(
        `SELECT name FROM ${MIGRATIONS_TABLE}`
      );
      const appliedSet = new Set(applied.map((r) => r.name));

      const migrations = listMigrations();
      let applied_count = 0;
      let baselined_count = 0;

      for (const m of migrations) {
        if (appliedSet.has(m.name)) continue;

        if (BASELINE_MIGRATIONS.has(m.name)) {
          await client.query(`INSERT INTO ${MIGRATIONS_TABLE}(name) VALUES ($1)`, [m.name]);
          baselined_count++;
          logger.info('migration baselined', { name: m.name });
          continue;
        }

        const sql = readFileSync(m.path, 'utf-8');
        await client.query('BEGIN');
        try {
          await client.query(sql);
          await client.query(`INSERT INTO ${MIGRATIONS_TABLE}(name) VALUES ($1)`, [m.name]);
          await client.query('COMMIT');
          applied_count++;
          logger.info('migration applied', { name: m.name });
        } catch (err) {
          await client.query('ROLLBACK');
          throw new Error(`migration ${m.name} failed: ${(err as Error).message}`);
        }
      }

      if (applied_count === 0 && baselined_count === 0) {
        logger.info('migrations: nothing to do', { total: migrations.length });
      } else {
        logger.info('migrations done', {
          applied: applied_count,
          baselined: baselined_count,
          total: migrations.length,
        });
      }
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY]);
    }
  } finally {
    client.release();
  }
}
