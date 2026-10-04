-- Identity by ISRC (docs/vision.md §4.4): each play keeps the ISRC AzuraCast
-- reports, and an artist records whether that code or only its name gave its
-- identity. Idempotent, like every migration here.
ALTER TABLE radio_play ADD COLUMN IF NOT EXISTS isrc text;
ALTER TABLE artist ADD COLUMN IF NOT EXISTS identified_by text DEFAULT 'name' NOT NULL;
