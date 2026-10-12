import { Client } from 'pg';
import { env } from '../config/env';
import { sslConfig } from './ssl';

/**
 * A connection of its own, without the pool's timeouts, for the rare batch that reads more than
 * they allow (artistSlugs.assignSlugs); the caller ends it.
 */
export async function connectLong(): Promise<Client> {
  const client = new Client({ connectionString: env.DATABASE_URL, ssl: sslConfig });
  await client.connect();
  return client;
}
