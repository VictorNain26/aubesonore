-- The discography: every album and EP the dump credits to an artist of the
-- population, one row per credited artist, whatever its secondary types (live,
-- compilation, remix…) and its date. Which of them a page shows is the
-- consumer's choice (musilogy.artist_releases); the table keeps them all.
--
-- A release group credited to several artists is each one's: n_credited says
-- how many share it. Years read with yr(), never a direct CAST: an illegible
-- or missing date becomes NULL and the release stays.
CREATE OR REPLACE TABLE releases AS
SELECT
  c.artist_mbid,
  c.rg_mbid,
  c.title,
  c.primary_type,
  c.secondary,
  c.y,
  c.n_credited
FROM (
  SELECT
    t.artist_mbid,
    r.mbid AS rg_mbid,
    r.title,
    r.primary_type,
    coalesce(r.secondary, []) AS secondary,
    yr(r.date) AS y,
    len(list_distinct(r.artists)) AS n_credited
  FROM raw_release_groups r, UNNEST(list_distinct(r.artists)) AS t(artist_mbid)
) c
WHERE EXISTS (SELECT 1 FROM artists a WHERE a.mbid = c.artist_mbid);
