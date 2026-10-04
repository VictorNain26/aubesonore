import { array, maxLength, minLength, object, safeParse, string, uuid, pipe } from 'valibot';

// Artist ids are generated with randomUUID; anything else never reaches the DB.
const ArtistIdSchema = pipe(string(), uuid('identifiant artiste invalide'));

export function isValidArtistId(value: unknown): value is string {
  return safeParse(ArtistIdSchema, value).success;
}

// A day of antenna is about 360 tracks: every artist of the thread fits in one request.
export const artistPagesSchema = object({
  names: pipe(
    array(pipe(string(), minLength(1, 'nom vide'), maxLength(200, 'nom trop long'))),
    maxLength(400, 'trop de noms')
  ),
});
