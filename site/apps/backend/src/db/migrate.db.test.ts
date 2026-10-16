import { afterAll, beforeAll, expect, it, spyOn } from 'bun:test';
import { readdirSync } from 'fs';
import { join } from 'path';
import { sql } from 'drizzle-orm';
import { db, pool } from '.';
import { logger } from '../lib/logger';
import { assertTestDatabase } from '../test/pg';
import { runMigrations } from './migrate';

// The runner applies, at every boot, each drizzle/*.sql not yet recorded: on a database that
// already has the schema (db:push here, an earlier boot in production) every migration must
// pass, and a second boot must apply nothing.
const migrationFiles = readdirSync(join(import.meta.dir, '../../drizzle'))
  .filter((name) => name.endsWith('.sql'))
  .map((name) => name.replace(/\.sql$/, ''))
  .sort();

async function recorded() {
  const { rows } = await db.execute<{ name: string; applied_at: Date }>(
    sql`SELECT name, applied_at FROM __app_migrations ORDER BY name`
  );
  return rows;
}

beforeAll(async () => {
  await assertTestDatabase();
  await db.execute(sql`DROP TABLE IF EXISTS __app_migrations`);
});

afterAll(async () => {
  await pool.end();
});

it('records every migration once, and a second run applies nothing', async () => {
  await runMigrations(pool);
  const first = await recorded();
  expect(first.map((row) => row.name)).toEqual(migrationFiles);

  const info = spyOn(logger, 'info');
  await runMigrations(pool);
  expect(await recorded()).toEqual(first);
  expect(info.mock.calls.map(([message]) => message)).toEqual(['migrations: nothing to do']);
  info.mockRestore();
});
