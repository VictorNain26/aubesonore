-- The last known answer of each source of the artist page (docs/vision.md
-- §4.6): a deploy no longer empties the page, and a source failing during a
-- refresh leaves its section as it was. Idempotent.
CREATE TABLE IF NOT EXISTS artist_profile (
  artist_id text PRIMARY KEY NOT NULL REFERENCES artist(id) ON DELETE CASCADE,
  image text,
  facts jsonb,
  links jsonb DEFAULT '[]'::jsonb NOT NULL,
  wikidata_id text,
  summary_fr jsonb,
  summary_en jsonb,
  refreshed_at timestamp with time zone NOT NULL
);
