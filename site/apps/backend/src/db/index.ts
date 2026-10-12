import { drizzle } from 'drizzle-orm/node-postgres';
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

export const db = drizzle(pool, { schema });
export { schema };
