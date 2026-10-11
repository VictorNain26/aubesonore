-- The Deezer portrait's column, kept by 0017 while a rollback could still run
-- a backend that read it; every deployed backend now reads `photo`
-- (docs/vision.md §2.5). Idempotent.
ALTER TABLE artist_profile DROP COLUMN IF EXISTS image;
