/**
 * The Postgres error code (SQLSTATE) behind a failed query, which Drizzle wraps as the error's
 * cause (postgresql.org/docs/current/errcodes-appendix.html).
 */
export function pgCode(err: unknown): string | undefined {
  const cause = (err as { cause?: { code?: unknown } } | null)?.cause;
  return typeof cause?.code === 'string' ? cause.code : undefined;
}

/** unique_violation: a concurrent writer got there first. */
export function isUniqueViolation(err: unknown): boolean {
  return pgCode(err) === '23505';
}

// invalid_schema_name, undefined_function, undefined_table.
const UNDEFINED = new Set(['3F000', '42883', '42P01']);

/** The schema, function or table asked for does not exist: musilogy not loaded yet, or older. */
export function isUndefinedObject(err: unknown): boolean {
  const code = pgCode(err);
  return code !== undefined && UNDEFINED.has(code);
}
