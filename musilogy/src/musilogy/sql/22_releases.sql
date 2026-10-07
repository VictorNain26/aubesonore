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

-- `official` says whether MusicBrainz shows the record as the artist's work:
-- the official status snapshot asks, for each artist surveyed, the album and
-- EP release groups its website lists by default, those whose releases are
-- not all promotions, bootlegs or pseudo-releases. A record is official when
-- one of its credited artists so surveyed lists it, not official when its
-- credited artists were surveyed and none lists it, and unknown (NULL) when
-- none was surveyed. A declared status, not a guess: on the played artists
-- (2026-10-06) it leaves out 476 of 4 980 records — Place Pigalle, The Cocaine
-- Sessions, promotional EPs — and leaves 149 unknown.
ALTER TABLE releases ADD COLUMN official BOOLEAN;
UPDATE releases SET official = s.official
FROM (
  SELECT r.rg_mbid,
    CASE WHEN count(o.release_groups) = 0 THEN NULL
         ELSE coalesce(bool_or(list_contains(o.release_groups, r.rg_mbid)), false) END AS official
  FROM releases r LEFT JOIN raw_official o USING (artist_mbid)
  GROUP BY r.rg_mbid
) s
WHERE s.rg_mbid = releases.rg_mbid;

-- How many records each status holds, for the manifest.
CREATE OR REPLACE TABLE release_status AS
WITH records AS (SELECT DISTINCT rg_mbid, official FROM releases)
SELECT
  count(*) FILTER (WHERE official) AS official,
  count(*) FILTER (WHERE NOT official) AS not_official,
  count(*) FILTER (WHERE official IS NULL) AS unknown
FROM records;

-- What the snapshot names and the discography cannot use, counted rather than
-- hidden: an ID that is not one (Wikidata holds "12-inch single" as a release
-- group ID on 2026-10-05), a release group the extraction does not hold
-- (single, other type, or absent from the dump), and one this table leaves out
-- for its secondary types.
CREATE OR REPLACE TABLE discography_exclusions AS
WITH named AS (
  SELECT DISTINCT rg_mbid,
    regexp_full_match(rg_mbid, '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}')
      AS well_formed
  FROM raw_discography
)
SELECT
  count(*) FILTER (WHERE NOT well_formed) AS malformed,
  count(*) FILTER (
    WHERE well_formed
      AND NOT EXISTS (SELECT 1 FROM raw_release_groups r WHERE r.mbid = n.rg_mbid)
  ) AS not_album_or_ep,
  count(*) FILTER (
    WHERE EXISTS (
      SELECT 1 FROM raw_release_groups r
      WHERE r.mbid = n.rg_mbid
        AND len(list_filter(coalesce(r.secondary, []), s -> s NOT IN ('Soundtrack', 'Remix'))) > 0)
  ) AS secondary_type
FROM named n;
