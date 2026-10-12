-- The unplayed artist pages that pass the indexing threshold
-- (services/discoveredArtists.ts), kept so a restart serves them as before
-- while the day's run recomputes them. Idempotent.
CREATE TABLE IF NOT EXISTS discovered_artist (
  mbid text PRIMARY KEY
);
