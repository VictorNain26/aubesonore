-- An artist's Deezer id now comes only from the Deezer link its MusicBrainz page declares (CC0),
-- never from Deezer's API, whose terms allow private use only and no « data » generated from it
-- (docs/vision.md §2.5). No column tells which ids the API gave, so every id is read again from
-- the loaded Musilogy dump (`musilogy.artist_urls`, the function the site reads): the one Deezer
-- artist the MBID's page declares, else none. An id two rows would share is no one's. Without a
-- loaded dump nothing can be checked: every id is cleared, and a resolution
-- (`artists:resolve`) reads them again from MusicBrainz. Idempotent.
UPDATE artist SET deezer_id = NULL WHERE deezer_id IS NOT NULL;

DO $$
BEGIN
  IF to_regnamespace('musilogy') IS NULL
     OR to_regprocedure('musilogy.artist_urls(text)') IS NULL THEN
    RETURN;
  END IF;
  WITH declared AS (
    SELECT a.id,
      (SELECT CASE WHEN count(DISTINCT d) = 1 THEN min(d) END
       FROM musilogy.artist_urls(a.mbid) u,
            substring(u.url FROM '^https://www\.deezer\.com/artist/(\d+)$') AS d
       WHERE d IS NOT NULL) AS deezer_id
    FROM artist a
    WHERE a.mbid IS NOT NULL
  )
  UPDATE artist a
  SET deezer_id = d.deezer_id
  FROM declared d
  WHERE a.id = d.id
    AND d.deezer_id IS NOT NULL
    AND (SELECT count(*) FROM declared o WHERE o.deezer_id = d.deezer_id) = 1;
END $$;
