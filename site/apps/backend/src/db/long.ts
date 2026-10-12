import { Client } from 'pg';
import { env } from '../config/env';
import { logger } from '../lib/logger';
import { sslConfig } from './ssl';

/**
 * A connection of its own, without the pool's timeouts, for the rare batch that reads more than
 * they allow (artistSlugs.assignSlugs); the caller ends it.
 */
export async function connectLong(): Promise<Client> {
  const client = new Client({ connectionString: env.DATABASE_URL, ssl: sslConfig });
  // A connection lost while idle between two reads emits 'error': unheard, it would end the
  // process (node-postgres.com/apis/client, events). The next query fails and the run stops.
  client.on('error', (err) => {
    logger.warn('db.long_connection_lost', { message: err.message });
  });
  await client.connect();
  return client;
}
