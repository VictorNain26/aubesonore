import { describe, expect, it, mock } from 'bun:test';
import { DrizzleQueryError, type SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';

import * as realSchema from './db/schema';

// A database that refuses every query as Postgres did on 2026-11-21, when the backend's role could
// not read Musilogy: drizzle's error carries the SQL and its parameters in its message.
const dialect = new PgDialect();
void mock.module('./db/index', () => ({
  schema: realSchema,
  db: {
    execute: (query: SQL) => {
      const built = dialect.sqlToQuery(query);
      return Promise.reject(
        new DrizzleQueryError(
          built.sql,
          built.params,
          Object.assign(new Error('permission denied for schema musilogy'), { code: '42501' })
        )
      );
    },
  },
}));

const { app } = await import('./app');

describe('an error no route handles', () => {
  it('answers 500 without the query, its parameters or the database error', async () => {
    const res = await app.handle(
      new Request('http://localhost/api/musilogy/search?q=radiohead', {
        headers: { 'cf-connecting-ip': '203.0.113.9' },
      })
    );
    const body = await res.text();

    expect(res.status).toBe(500);
    expect(JSON.parse(body)).toEqual({ error: 'Internal server error' });
    expect(body).not.toContain('SELECT');
    expect(body).not.toContain('radiohead');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
  });
});
