-- Production's database predates these migrations: 0000 is recorded there as applied, not run.
-- This brings it to what 0000 builds, and changes nothing on a database 0000 built.

-- Query statistics; the library is preloaded by compose.yaml (shared_preload_libraries).
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
--> statement-breakpoint
-- Three foreign keys were named by hand-written SQL, not by Drizzle.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'artist_profile_artist_id_fkey') THEN
    ALTER TABLE artist_profile
      RENAME CONSTRAINT artist_profile_artist_id_fkey TO artist_profile_artist_id_artist_id_fk;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'artist_slug_artist_id_fkey') THEN
    ALTER TABLE artist_slug
      RENAME CONSTRAINT artist_slug_artist_id_fkey TO artist_slug_artist_id_artist_id_fk;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'liked_tracks_artist_id_fkey') THEN
    ALTER TABLE liked_tracks
      RENAME CONSTRAINT liked_tracks_artist_id_fkey TO liked_tracks_artist_id_artist_id_fk;
  END IF;
END $$;
--> statement-breakpoint
-- The log of the runner Drizzle's migrator replaced.
DROP TABLE IF EXISTS __app_migrations;
