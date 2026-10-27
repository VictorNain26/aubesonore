-- A kept track's ISRC counts only for the played track (docs/vision.md §4.4): the code the antenna
-- played that very track under. The old catch-up (`artists:resolve`) copied codes from Deezer's
-- API, whose terms allow private use only and no « data » generated from it (§2.5). No column
-- tells which codes came from there, so every code is kept only when a play of the same title by
-- the same artist carries it, both compared lower-cased with every run of other characters than
-- letters and digits read as one space; any other is cleared. Idempotent.
UPDATE liked_tracks lt
SET isrc = NULL
WHERE lt.isrc IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM radio_play rp
    WHERE rp.isrc = lt.isrc
      AND btrim(regexp_replace(lower(rp.title), '[^[:alnum:]]+', ' ', 'g'))
        = btrim(regexp_replace(lower(lt.title), '[^[:alnum:]]+', ' ', 'g'))
      AND btrim(regexp_replace(lower(rp.artist), '[^[:alnum:]]+', ' ', 'g'))
        = btrim(regexp_replace(lower(lt.artist), '[^[:alnum:]]+', ' ', 'g'))
  );
