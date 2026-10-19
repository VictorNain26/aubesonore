-- « Même son » (docs/vision.md §2.2): a neighbour of the co-listening, in
-- either direction, that shares the artist's colour in any era. Taste and
-- colour must agree. Measured once, against sourced descriptions of the
-- sound, on the first 8 neighbours of 75 artists: 87 % judged the same sound
-- or a kinship [83, 91], none foreign (2026-10-11), where the co-listening
-- alone gave 54 % (2026-10-08). Neither signal is shown alone: the styles
-- alone stay below 40 % where the co-listening has nothing to say.
-- The colour is Discogs' alone (2026-10-17): an artist Discogs does not reach
-- has none, and no « Même son ». The measure above let MusicBrainz's genres
-- stand in for such an artist; their licence is not CC0 (LICENSE-DATA), and
-- they are no longer read.
-- A derived table: it reads the sources' tables and rewrites none
-- (docs/conception.md §1).

SET VARIABLE same_sound_min_colour = 0.35::DOUBLE;
-- A profile of a few records matches anything: the similarity of a neighbour
-- whose profile counts n records is shrunk by n / (n + shrink).
-- n counts the dated records only: the rule the measure of
-- 2026-10-11 judged. It leaves without a colour the 2 834 of 503 892 Discogs
-- profiles whose records are all undated (2026-10-11); counting them is a
-- change to measure, not to assume.
SET VARIABLE same_sound_styles_shrink = 10::INTEGER;
-- Under three style-records an artist has no colour.
SET VARIABLE same_sound_min_style_records = 3::INTEGER;

-- One term of a dot product, exact from here on: doubles summed by parallel
-- threads add up in an order that changes from run to run, and so would the
-- colour, the pairs at the threshold and the delivery's bytes. Decimals add
-- up to the same value in any order.
CREATE OR REPLACE MACRO dot_term(x) AS CAST(x AS DECIMAL(38, 20));

-- The colour of an artist, from Discogs: the share of its style-records in
-- each style, whatever their decade, weighted by the style's rarity (Krautrock
-- says much, Rock almost nothing), so that a prolific artist does not win by
-- sheer count. Compared decade by decade, two artists of one sound decades
-- apart missed each other (BEAK> and Can: 0.20 against 0.77) and the pairs
-- kept were no better judged (2026-10-09).
CREATE OR REPLACE TABLE colour_styles AS
WITH total AS (
  SELECT artist_mbid, sum(records) AS n, coalesce(sum(records) FILTER (WHERE decade IS NOT NULL), 0)
    AS dated
  FROM styles GROUP BY 1
),
rarity AS (
  SELECT style, ln((SELECT count(*) FROM total) / count(DISTINCT artist_mbid)) AS idf
  FROM styles GROUP BY 1
)
SELECT s.artist_mbid, s.style AS term, sum(s.records) / any_value(t.n) * any_value(r.idf) AS w,
  any_value(t.dated) AS n
FROM styles s JOIN total t USING (artist_mbid) JOIN rarity r USING (style)
WHERE t.n >= getvariable('same_sound_min_style_records')
GROUP BY s.artist_mbid, s.style;

-- Each profile's length, for the cosine.
CREATE OR REPLACE TABLE colour_norms AS
SELECT artist_mbid, sqrt(sum(dot_term(w * w))::DOUBLE) AS norm, any_value(n) AS n
FROM colour_styles GROUP BY artist_mbid;

-- The candidates: an artist's neighbours of the co-listening, and the artists
-- whose neighbours it is. The second direction finds the heirs of an old,
-- famous artist, whose own neighbours are its era's canon: of the 18 judged
-- pairs found only that way, 17 were good (2026-10-09). A pair found both ways
-- keeps its higher score.
SET preserve_insertion_order = false;
CREATE OR REPLACE TABLE same_sound_candidates AS
SELECT artist_mbid, neighbour_mbid, max(score) AS colisten_score FROM (
  SELECT artist_mbid, neighbour_mbid, score FROM colisten
  UNION ALL
  SELECT neighbour_mbid, artist_mbid, score FROM colisten
) GROUP BY ALL;

-- The colour two candidates share: their Discogs styles, when both have a
-- profile and share a style; else none.
CREATE OR REPLACE TABLE same_sound_shared AS
SELECT p.artist_mbid, p.neighbour_mbid, sum(dot_term(a.w * b.w))::DOUBLE AS x
FROM same_sound_candidates p
JOIN colour_styles a ON a.artist_mbid = p.artist_mbid
JOIN colour_styles b ON b.artist_mbid = p.neighbour_mbid AND b.term = a.term
GROUP BY ALL;

-- The candidates whose colour agrees.
CREATE OR REPLACE TABLE same_sound_pairs AS
SELECT c.artist_mbid, c.neighbour_mbid, c.colisten_score, s.colour
FROM same_sound_candidates c
JOIN (
  SELECT s.artist_mbid, s.neighbour_mbid,
    s.x / (na.norm * nb.norm) * nb.n / (nb.n + getvariable('same_sound_styles_shrink'))
      AS colour
  FROM same_sound_shared s
  JOIN colour_norms na ON na.artist_mbid = s.artist_mbid
  JOIN colour_norms nb ON nb.artist_mbid = s.neighbour_mbid
) s USING (artist_mbid, neighbour_mbid)
WHERE s.colour >= getvariable('same_sound_min_colour');

-- Ranked from 1 by the co-listening's score, a tie falling to the neighbour's
-- MBID, each with its reason: the style that weighs most in what the two
-- share, with the artist's decade with the most of its records in it, NULL
-- when none is dated. `source` names the colour, always 'styles': the column
-- stays, artist_same_sound returns it and its signature is a contract
-- (docs/conception.md §4).
CREATE OR REPLACE TABLE same_sound AS
WITH reasons AS (
  SELECT p.artist_mbid, p.neighbour_mbid, a.term
  FROM same_sound_pairs p
  JOIN colour_styles a ON a.artist_mbid = p.artist_mbid
  JOIN colour_styles b ON b.artist_mbid = p.neighbour_mbid AND b.term = a.term
  QUALIFY row_number() OVER (
    PARTITION BY p.artist_mbid, p.neighbour_mbid ORDER BY dot_term(a.w * b.w) DESC, a.term) = 1
),
decades AS (
  SELECT artist_mbid, style AS term, decade FROM styles WHERE decade IS NOT NULL
  QUALIFY row_number() OVER (
    PARTITION BY artist_mbid, style ORDER BY records DESC, decade) = 1
)
SELECT p.artist_mbid, p.neighbour_mbid,
  row_number() OVER (
    PARTITION BY p.artist_mbid ORDER BY p.colisten_score DESC, p.neighbour_mbid)::INTEGER AS rank,
  p.colisten_score, 'styles' AS source, p.colour, r.term, d.decade
FROM same_sound_pairs p
JOIN reasons r USING (artist_mbid, neighbour_mbid)
LEFT JOIN decades d ON d.artist_mbid = p.artist_mbid AND d.term = r.term;

-- The profiles hold a row per artist, style and decade: freed for the rest of
-- the build, as 84_discogs.sql frees discogs_work.
DROP TABLE same_sound_pairs;
DROP TABLE same_sound_shared;
DROP TABLE same_sound_candidates;
DROP TABLE colour_norms;
DROP TABLE colour_styles;
RESET preserve_insertion_order;
