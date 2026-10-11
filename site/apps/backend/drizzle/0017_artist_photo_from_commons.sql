-- The portrait is the Wikimedia Commons photo of the artist's Wikidata item,
-- with what its licence asks to credit; Deezer's, whose terms allow only a
-- private use, leaves (docs/vision.md §2.5). Every stored profile is asked
-- again at its next view. Idempotent.
ALTER TABLE artist_profile ADD COLUMN IF NOT EXISTS photo jsonb;
ALTER TABLE artist_profile DROP COLUMN IF EXISTS image;
UPDATE artist_profile SET refreshed_at = 'epoch';
