-- One YouTube lookup per song, shared by every listener who keeps it: the
-- verified Art Track, or none, with the date YouTube was last asked (its data
-- is refreshed or deleted within 30 days). Idempotent.
CREATE TABLE IF NOT EXISTS youtube_link (
  song_key text PRIMARY KEY NOT NULL,
  video_id text,
  checked_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS youtube_link_checked_at_idx ON youtube_link (checked_at);
