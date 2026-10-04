import { maxLength, minLength, pipe, safeParse, string, toLowerCase, trim, uuid } from 'valibot';

// MBIDs are compared byte for byte in musilogy (COLLATE "C"): lowercased here.
const Mbid = pipe(string(), uuid('identifiant MusicBrainz invalide'), toLowerCase());
// A name to search by: long enough to narrow, short enough to stay a name.
const Query = pipe(string(), trim(), minLength(2), maxLength(100));

export function parseMbid(value: unknown): string | null {
  const parsed = safeParse(Mbid, value);
  return parsed.success ? parsed.output : null;
}

export function parseSearchQuery(value: unknown): string | null {
  const parsed = safeParse(Query, value);
  return parsed.success ? parsed.output : null;
}
