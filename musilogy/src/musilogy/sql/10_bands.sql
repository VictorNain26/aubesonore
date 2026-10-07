-- Population. Every artist extracted by extract.py, special purpose artists
-- aside, is published, whatever its type (none included), dates or genres.
--
-- Only a formation becomes y0_declared (formed(), 00_macros.sql). A person's
-- begin is a birth: it travels as y_birth instead. The begin of an artist
-- without a type, a character or an "other" may be either: it is dropped and
-- counted (begin_ambiguous), and its start comes from its first album, as a
-- person's does. Every end — a death, a split — ends the activity, so it is
-- read alike for every type.
-- dump_year and min_year are provided by build() via SET VARIABLE.
-- The boolean columns carry the date sub-rules: they decide nothing beyond
-- y0_declared/y_end_declared/y_birth, they just name the same decision so
-- that publish.py can count it without recomputing it — except
-- birth_below_min_year, which 30_bands_lifespan.sql reads as a guard.
CREATE OR REPLACE TABLE dated AS
SELECT
  mbid, name,
  -- MusicBrainz writes an absent comment as an empty string: NULL says
  -- "none" in one way only.
  nullif(disambiguation, '') AS disambiguation,
  type, ended, country, begin_area, begin_area_mbid, genres,
  CASE WHEN formed(type)
        AND yr(begin) BETWEEN getvariable('min_year') AND getvariable('dump_year')
       THEN yr(begin) END AS y0_declared,
  CASE WHEN person(type) AND yr(begin) <= getvariable('dump_year')
       THEN yr(begin) END AS y_birth,
  -- Same window as the begin, at both ends: an end below min_year is as
  -- unusable as one in the future.
  CASE WHEN yr("end") BETWEEN getvariable('min_year') AND getvariable('dump_year')
        AND (yr(begin) IS NULL OR yr("end") >= yr(begin))
       THEN yr("end") END AS y_end_declared,
  -- The begin sub-rules only describe a begin read as a formation: a birth
  -- in 1685 is a fact, not an anomaly.
  formed(type) AND begin IS NOT NULL AND yr(begin) IS NULL AS begin_illegible,
  NOT formed(type) AND NOT person(type) AND yr(begin) IS NOT NULL
    AS begin_ambiguous,
  "end" IS NOT NULL AND yr("end") IS NULL AS end_illegible,
  -- A birth that cannot be read, or lies in the future, is lost like any
  -- other date and counted like one. A birth below min_year is not an
  -- anomaly — Bach was born in 1685 — and is kept.
  person(type) AND begin IS NOT NULL AND yr(begin) IS NULL AS birth_illegible,
  -- yr(begin) IS NOT NULL keeps these false rather than NULL without a
  -- birth: 30_bands_lifespan.sql negates birth_below_min_year, and a NULL
  -- there refused the albums of every person with no birth.
  person(type) AND yr(begin) IS NOT NULL AND yr(begin) > getvariable('dump_year')
    AS birth_future,
  person(type) AND yr(begin) IS NOT NULL AND yr(begin) < getvariable('min_year')
    AS birth_below_min_year,
  formed(type) AND yr(begin) IS NOT NULL AND yr(begin) > getvariable('dump_year')
    AS begin_future,
  yr("end") IS NOT NULL AND yr("end") > getvariable('dump_year') AS end_future,
  formed(type) AND yr(begin) IS NOT NULL AND yr(begin) < getvariable('min_year')
    AS begin_below_min_year,
  yr("end") IS NOT NULL AND yr("end") < getvariable('min_year') AS end_below_min_year,
  yr(begin) IS NOT NULL AND yr("end") IS NOT NULL
    AND yr("end") <= getvariable('dump_year')
    AND yr("end") < yr(begin) AS end_before_begin
FROM raw_artists;

-- Date-anomaly counters for manifest.json: population = raw_artists, i.e.
-- every artist extracted, persons included, not just `artists` after
-- filtering.
-- The r2_ prefix is frozen rather than left over: the name is a published
-- manifest key, so renaming it would break that contract.
CREATE OR REPLACE TABLE r2_anomalies AS
SELECT
  sum(begin_illegible::INTEGER) AS begin_illegible,
  sum(end_illegible::INTEGER) AS end_illegible,
  sum(begin_future::INTEGER) AS begin_future,
  sum(end_future::INTEGER) AS end_future,
  sum(begin_below_min_year::INTEGER) AS begin_below_min_year,
  sum(end_below_min_year::INTEGER) AS end_below_min_year,
  sum(end_before_begin::INTEGER) AS end_before_begin,
  sum(birth_illegible::INTEGER) AS birth_illegible,
  sum(birth_future::INTEGER) AS birth_future,
  sum(begin_ambiguous::INTEGER) AS begin_ambiguous
FROM dated;

CREATE OR REPLACE TABLE artists AS
SELECT mbid, name, disambiguation,
  -- The lookup key for a typed name: "bjork" finds Björk. strip_accents
  -- leaves ligatures and ß as they are (æ, œ, ß): a reader typing "ae" for
  -- "æ" is not served, which the lookup accepts rather than hand-writing a
  -- transliteration table.
  strip_accents(lower(name)) AS name_key,
  type, y0_declared, y_end_declared, y_birth, ended, country, begin_area,
  -- The area's identity, beside its name: two artists from London share a
  -- name, not necessarily a place (London, Ontario).
  begin_area_mbid,
  -- Explicit sort (votes descending, then name), never inherited from
  -- the source (alphabetical). list_sort does not accept a lambda comparator
  -- in 1.5.5: sort by key, projecting each genre onto {k: [-votes], n: name,
  -- v: genre}, list_sort compares structs field by field.
  list_transform(
    list_sort(list_transform(genres, x -> {'k': [-x.votes::INT], 'n': x.name, 'v': x})),
    y -> y.v
  ) AS genres_declared
FROM dated;
