-- The portrait is the Wikimedia Commons photo of the artist's Wikidata item,
-- with what its licence asks to credit; Deezer's, whose terms allow only a
-- private use, leaves (docs/vision.md §2.5). Every stored profile is asked
-- again at its next view. The old column stays until no backend that could
-- run reads it: a deploy rolled back to the previous commit still reads
-- `image`; a later migration drops it. Idempotent.
ALTER TABLE artist_profile ADD COLUMN IF NOT EXISTS photo jsonb;
UPDATE artist_profile SET refreshed_at = 'epoch';
