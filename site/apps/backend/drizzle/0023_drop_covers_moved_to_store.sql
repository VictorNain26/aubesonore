-- The kept tracks' covers now live in the cover store, a volume of files (services/coverStore.ts).
-- services/keptCovers.ts moves each row there at boot, before this runs, and deletes the row only
-- once its file holds the same bytes. A row still here was not moved: the table is kept and the
-- boot stops, so the deploy goes back to the previous version and no kept cover is lost.
-- Idempotent: a database without the table passes.
DO $$
BEGIN
  IF to_regclass('public.covers') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM covers) THEN
      RAISE EXCEPTION 'covers still holds covers not moved to the cover store';
    END IF;
    DROP TABLE covers;
  END IF;
END $$;
