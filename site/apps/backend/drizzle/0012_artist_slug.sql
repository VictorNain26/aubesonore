-- The slug of each artist page moves to its own table, where it is unique: the
-- page URL is /artiste/<slug> (docs/vision.md §5), and a slug once given never
-- changes. Existing slugs are kept; a repeated one takes a suffix by order of
-- first play. Idempotent.
CREATE TABLE IF NOT EXISTS artist_slug (
  slug text PRIMARY KEY NOT NULL,
  artist_id text NOT NULL REFERENCES artist(id) ON DELETE CASCADE,
  CONSTRAINT artist_slug_artist_id_unique UNIQUE (artist_id)
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'artist' AND column_name = 'slug'
  ) THEN
    INSERT INTO artist_slug (slug, artist_id)
    SELECT
      CASE WHEN n = 1 THEN slug ELSE slug || '-' || n END,
      id
    FROM (
      SELECT id, slug, row_number() OVER (PARTITION BY slug ORDER BY first_seen_at, id) AS n
      FROM artist
    ) ranked
    ON CONFLICT DO NOTHING;
    -- A page without a slug would have no address: stop rather than drop it.
    IF EXISTS (
      SELECT 1 FROM artist a WHERE NOT EXISTS (SELECT 1 FROM artist_slug s WHERE s.artist_id = a.id)
    ) THEN
      RAISE EXCEPTION 'artist_slug: an artist has no slug after the copy';
    END IF;
    ALTER TABLE artist DROP COLUMN slug;
  END IF;
END $$;
