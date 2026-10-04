import { array, maxLength, minLength, object, pipe, regex, safeParse, string, uuid } from 'valibot';

// Artist ids are generated with randomUUID; anything else never reaches the DB.
const ArtistIdSchema = pipe(string(), uuid('identifiant artiste invalide'));

export function isValidArtistId(value: unknown): value is string {
  return safeParse(ArtistIdSchema, value).success;
}

// slugify's output: letters and digits of every script, joined by single hyphens.
const ArtistSlugSchema = pipe(
  string(),
  maxLength(200, 'slug trop long'),
  regex(/^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u, 'slug invalide')
);

export function isValidArtistSlug(value: unknown): value is string {
  return safeParse(ArtistSlugSchema, value).success;
}

// A day of antenna is about 360 tracks: every artist of the thread fits in one request.
export const artistPagesSchema = object({
  names: pipe(
    array(pipe(string(), minLength(1, 'nom vide'), maxLength(200, 'nom trop long'))),
    maxLength(400, 'trop de noms')
  ),
});
