-- An artist's facts, listening links and Wikidata item now come from the
-- MusicBrainz dump through musilogy (docs/vision.md §4.5), read at each view:
-- the profile stores only what live sources answer. Idempotent.
ALTER TABLE artist_profile DROP COLUMN IF EXISTS facts;
ALTER TABLE artist_profile DROP COLUMN IF EXISTS links;
ALTER TABLE artist_profile DROP COLUMN IF EXISTS wikidata_id;
