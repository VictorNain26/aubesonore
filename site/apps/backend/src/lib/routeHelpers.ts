// Shared helpers for Elysia routes.
//
// Until a real route shape difference shows up, only the truly-duplicated
// `hasError` guard lives here. The per-route `ServiceResponse` shapes keep
// their domain-specific data field — extracting
// a generic `<T>` would force consumers through an extra discriminant for no
// real win today.

export function hasError(data: unknown): data is { error: string } {
  return data !== null && typeof data === 'object' && 'error' in data;
}
