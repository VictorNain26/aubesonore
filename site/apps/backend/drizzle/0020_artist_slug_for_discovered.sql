-- A slug for the page of an artist never played that passed the indexing
-- threshold, named by its MBID, in the same namespace as the played artists'
-- slugs (docs/vision.md §5). Idempotent.
ALTER TABLE artist_slug ALTER COLUMN artist_id DROP NOT NULL;
ALTER TABLE artist_slug ADD COLUMN IF NOT EXISTS mbid text;
CREATE UNIQUE INDEX IF NOT EXISTS artist_slug_mbid_unique ON artist_slug (mbid);
DO $$
BEGIN
  ALTER TABLE artist_slug
    ADD CONSTRAINT artist_slug_one_owner CHECK (num_nonnulls(artist_id, mbid) = 1);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
