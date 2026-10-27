import { maxLength, pipe, regex, safeParse, string, uuid } from 'valibot';

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
