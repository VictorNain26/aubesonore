-- « Même son » (docs/vision.md §2.2): a neighbour of the co-listening, in
-- either direction, that shares the artist's colour in any era. Taste and
-- colour must agree; measured on 61 reference artists against sourced
-- descriptions of their sound: with the colour compared decade by decade,
-- 81 % of the neighbours shown judged the same sound or a kinship, none
-- foreign, against 54 % for the co-listening alone (2026-10-08); in any era
-- and both directions, on all listens, 90.5 % of the 105 pairs already judged
-- among the first 8, none foreign (2026-10-10). Neither signal is shown alone:
-- the styles alone stay below 40 % where the co-listening has nothing to say.
-- A derived table: it reads the sources' tables and rewrites none
-- (docs/conception.md §1).

SET VARIABLE same_sound_min_colour = 0.35::DOUBLE;
-- A profile of a few records matches anything: the similarity of a neighbour
-- whose profile counts n records (or votes) is shrunk by n / (n + shrink),
-- counting for styles the dated records, as measured.
SET VARIABLE same_sound_styles_shrink = 10::INTEGER;
SET VARIABLE same_sound_genres_shrink = 3::INTEGER;
-- Under three style-records an artist has no Discogs colour, only genres.
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

-- Else from MusicBrainz: the share of each genre's votes, a genre voted once
-- or not at all counting one, weighted the same way; genres have no decade.
CREATE OR REPLACE TABLE colour_genres AS
WITH voted AS (
  SELECT a.mbid AS artist_mbid, t.g.name AS term, greatest(t.g.votes, 1) AS v
  FROM artists a, UNNEST(a.genres) AS t(g)
),
rarity AS (
  SELECT term, ln((SELECT count(DISTINCT artist_mbid) FROM voted) / count(DISTINCT artist_mbid))
    AS idf
  FROM voted GROUP BY 1
)
SELECT v.artist_mbid, v.term,
  v.v / sum(v.v) OVER (PARTITION BY v.artist_mbid) * r.idf AS w,
  sum(v.v) OVER (PARTITION BY v.artist_mbid) AS n
FROM voted v JOIN rarity r USING (term);

-- Each profile's length, for the cosine.
CREATE OR REPLACE TABLE colour_norms AS
SELECT 'styles' AS source, artist_mbid, sqrt(sum(dot_term(w * w))::DOUBLE) AS norm,
  any_value(n) AS n
FROM colour_styles GROUP BY artist_mbid
UNION ALL
SELECT 'genres', artist_mbid, sqrt(sum(dot_term(w * w))::DOUBLE), any_value(n)
FROM colour_genres GROUP BY artist_mbid;

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

-- The colour two candidates share: their Discogs styles when both have a
-- profile and share a style; else, when one of the two has no Discogs
-- profile, their genres when they share one; else none. Two Discogs profiles
-- without a style in common are a sign of two sounds that a broad shared genre
-- does not overturn: on the pairs judged, 1 of the 3 such neighbours was good
-- (2026-10-09).
CREATE OR REPLACE TABLE same_sound_shared AS
SELECT 'styles' AS source, p.artist_mbid, p.neighbour_mbid, sum(dot_term(a.w * b.w))::DOUBLE AS x
FROM same_sound_candidates p
JOIN colour_styles a ON a.artist_mbid = p.artist_mbid
JOIN colour_styles b ON b.artist_mbid = p.neighbour_mbid AND b.term = a.term
GROUP BY ALL;

INSERT INTO same_sound_shared
SELECT 'genres', p.artist_mbid, p.neighbour_mbid, sum(dot_term(a.w * b.w))::DOUBLE
FROM same_sound_candidates p
JOIN colour_genres a ON a.artist_mbid = p.artist_mbid
JOIN colour_genres b ON b.artist_mbid = p.neighbour_mbid AND b.term = a.term
WHERE NOT (
  EXISTS (SELECT 1 FROM colour_norms n WHERE n.source = 'styles' AND n.artist_mbid = p.artist_mbid)
  AND EXISTS (
    SELECT 1 FROM colour_norms n WHERE n.source = 'styles' AND n.artist_mbid = p.neighbour_mbid))
GROUP BY ALL;

-- The candidates whose colour agrees. A neighbour without a dated record is
-- shrunk to no colour: n / (n + shrink) = 0.
CREATE OR REPLACE TABLE same_sound_pairs AS
SELECT c.artist_mbid, c.neighbour_mbid, c.colisten_score, s.source, s.colour
FROM same_sound_candidates c
JOIN (
  SELECT s.source, s.artist_mbid, s.neighbour_mbid,
    s.x / (na.norm * nb.norm) * nb.n / (nb.n + CASE s.source
      WHEN 'styles' THEN getvariable('same_sound_styles_shrink')
      ELSE getvariable('same_sound_genres_shrink') END) AS colour
  FROM same_sound_shared s
  JOIN colour_norms na ON na.source = s.source AND na.artist_mbid = s.artist_mbid
  JOIN colour_norms nb ON nb.source = s.source AND nb.artist_mbid = s.neighbour_mbid
) s USING (artist_mbid, neighbour_mbid)
WHERE s.colour >= getvariable('same_sound_min_colour');

-- Ranked from 1 by the co-listening's score, a tie falling to the neighbour's
-- MBID, each with its reason: the style or the genre that weighs most in what
-- the two share; for a style, the artist's decade with the most of its records
-- in it, NULL when none is dated.
CREATE OR REPLACE TABLE same_sound AS
WITH reasons AS (
  SELECT p.artist_mbid, p.neighbour_mbid, a.term
  FROM same_sound_pairs p
  JOIN colour_styles a ON a.artist_mbid = p.artist_mbid
  JOIN colour_styles b ON b.artist_mbid = p.neighbour_mbid AND b.term = a.term
  WHERE p.source = 'styles'
  QUALIFY row_number() OVER (
    PARTITION BY p.artist_mbid, p.neighbour_mbid ORDER BY dot_term(a.w * b.w) DESC, a.term) = 1
  UNION ALL
  SELECT p.artist_mbid, p.neighbour_mbid, a.term
  FROM same_sound_pairs p
  JOIN colour_genres a ON a.artist_mbid = p.artist_mbid
  JOIN colour_genres b ON b.artist_mbid = p.neighbour_mbid AND b.term = a.term
  WHERE p.source = 'genres'
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
    PARTITION BY p.artist_mbid ORDER BY p.colisten_score DESC, p.neighbour_mbid)::SMALLINT AS rank,
  p.colisten_score, p.source, p.colour, r.term,
  CASE WHEN p.source = 'styles' THEN d.decade END AS decade
FROM same_sound_pairs p
JOIN reasons r USING (artist_mbid, neighbour_mbid)
LEFT JOIN decades d ON d.artist_mbid = p.artist_mbid AND d.term = r.term;

-- The profiles hold a row per artist, style and decade: freed for the rest of
-- the build, as 84_discogs.sql frees discogs_work.
DROP TABLE same_sound_pairs;
DROP TABLE same_sound_shared;
DROP TABLE same_sound_candidates;
DROP TABLE colour_norms;
DROP TABLE colour_genres;
DROP TABLE colour_styles;
RESET preserve_insertion_order;
