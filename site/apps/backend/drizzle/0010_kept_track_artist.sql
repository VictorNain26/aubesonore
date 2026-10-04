-- Each kept track tied to its artist (docs/vision.md §4.4): the artist page
-- shows what a listener kept of an artist, and the alerts find who kept them
-- by identity rather than by a lowercased name. Idempotent.
ALTER TABLE liked_tracks
  ADD COLUMN IF NOT EXISTS artist_id text REFERENCES artist(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS liked_tracks_artist_user_idx ON liked_tracks (artist_id, user_id);
