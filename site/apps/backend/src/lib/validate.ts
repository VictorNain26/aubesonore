import { safeParse } from 'valibot';
import type { BaseSchema, BaseIssue } from 'valibot';

interface ValidationError {
  error: string;
}

export function validateBody<T>(
  schema: BaseSchema<unknown, T, BaseIssue<unknown>>,
  body: unknown
): T | ValidationError {
  const result = safeParse(schema, body);

  if (!result.success) {
    const messages = result.issues.map((issue) => issue.message).join(', ');
    return { error: `Validation échouée : ${messages}` };
  }

  return result.output;
}
