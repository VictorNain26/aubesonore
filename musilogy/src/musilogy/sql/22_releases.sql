-- The discography: an artist's records, one row per credited artist of the
-- population — albums and EPs whose only secondary types, if any, are
-- Soundtrack and Remix. A soundtrack the artist composed and a remix album are
-- part of the work; the live recordings, compilations, demos, DJ-mixes and
-- interviews MusicBrainz also files under an artist stay out, as `albums`
-- keeps them out of an artist's dates (20_albums.sql). Which of these rows a
-- page shows — no EP before the first album, nothing after a group's declared
-- end — is musilogy.artist_releases's call: the table keeps them all.
--
-- `filed_original` says Wikidata files the release group as a studio album or
-- an EP (the discography snapshot): a posthumous record so filed is new music,
-- not an archive. Its soundtrack form is left aside: compilations of a film's
-- songs carry it too (Imagine: Music From the Motion Picture, 1988).
--
-- Years read with yr(), never a direct CAST: an illegible or missing date
-- becomes NULL and the release stays.
CREATE OR REPLACE TABLE releases AS
SELECT
  c.artist_mbid,
  c.rg_mbid,
  c.title,
  c.primary_type,
  c.soundtrack,
  c.remix,
  c.y,
  EXISTS (
    SELECT 1 FROM raw_discography d
    WHERE d.rg_mbid = c.rg_mbid AND d.form IN ('studio', 'ep')
  ) AS filed_original
FROM (
  SELECT
    t.artist_mbid,
    r.mbid AS rg_mbid,
    r.title,
    r.primary_type,
    list_contains(coalesce(r.secondary, []), 'Soundtrack') AS soundtrack,
    list_contains(coalesce(r.secondary, []), 'Remix') AS remix,
    yr(r.date) AS y
  FROM raw_release_groups r, UNNEST(list_distinct(r.artists)) AS t(artist_mbid)
  WHERE len(list_filter(coalesce(r.secondary, []), s -> s NOT IN ('Soundtrack', 'Remix'))) = 0
) c
WHERE EXISTS (SELECT 1 FROM artists a WHERE a.mbid = c.artist_mbid);

-- What the snapshot names and the discography cannot use, counted rather than
-- hidden: an ID that is not one (Wikidata holds "12-inch single" as a release
-- group ID on 2026-10-05), a release group the extraction does not hold
-- (single, other type, or absent from the dump), and one this table leaves out
-- for its secondary types.
CREATE OR REPLACE TABLE discography_exclusions AS
WITH named AS (SELECT DISTINCT rg_mbid FROM raw_discography)
SELECT
  count(*) FILTER (
    WHERE NOT regexp_full_match(rg_mbid, '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}')
  ) AS malformed,
  count(*) FILTER (
    WHERE regexp_full_match(rg_mbid, '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}')
      AND NOT EXISTS (SELECT 1 FROM raw_release_groups r WHERE r.mbid = n.rg_mbid)
  ) AS not_album_or_ep,
  count(*) FILTER (
    WHERE EXISTS (
      SELECT 1 FROM raw_release_groups r
      WHERE r.mbid = n.rg_mbid
        AND len(list_filter(coalesce(r.secondary, []), s -> s NOT IN ('Soundtrack', 'Remix'))) > 0)
  ) AS secondary_type
FROM named n;
