-- « Même son » (docs/vision.md §2.2): a neighbour of the co-listening, in
-- either direction, that shares the artist's colour in any era. The
-- co-listening proposes, the colour decides and ranks: among the candidates
-- the bench judged, the colour told the good from the bad and the
-- co-listening's score did not (2026-10-21). The measures are the bench's
-- report (`musilogy bench report`), never copied here.
-- The colour is Discogs' alone (2026-10-17): an artist Discogs does not reach
-- has none, and no « Même son ».
-- A derived table: it reads the sources' tables and rewrites none
-- (docs/conception.md §1).
--
-- Some seventy million candidate pairs go through here under the build's
-- memory bound (build.connect). They are keyed by integers, not by MBIDs:
-- strings take more memory and are slower to join and aggregate, and in a
-- constrained memory the narrowest types are the ones that let a query
-- finish (DuckDB, Performance guide, « Schema »).

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

SET preserve_insertion_order = false;

-- The artists of the co-listening and the styles, numbered.
CREATE OR REPLACE TABLE same_sound_artists AS
SELECT (row_number() OVER (ORDER BY mbid))::INTEGER AS id, mbid FROM (
  SELECT artist_mbid AS mbid FROM colisten UNION SELECT neighbour_mbid FROM colisten
);
CREATE OR REPLACE TABLE same_sound_styles AS
SELECT (row_number() OVER (ORDER BY style))::SMALLINT AS term, style
FROM (SELECT DISTINCT style FROM styles);

-- The colour of an artist, from Discogs: the share of its style-records in
-- each style, whatever their decade, weighted by the style's rarity (Krautrock
-- says much, Rock almost nothing), so that a prolific artist does not win by
-- sheer count. Compared decade by decade, two artists of one sound decades
-- apart missed each other (BEAK> and Can: 0.20 against 0.77) and the pairs
-- kept were no better judged (2026-10-09).
CREATE OR REPLACE TABLE same_sound_total AS
SELECT artist_mbid, sum(records) AS n,
  coalesce(sum(records) FILTER (WHERE decade IS NOT NULL), 0) AS dated
FROM styles GROUP BY 1;
CREATE OR REPLACE TABLE same_sound_rarity AS
SELECT style, ln((SELECT count(*) FROM same_sound_total) / count(DISTINCT artist_mbid)) AS idf
FROM styles GROUP BY 1;
CREATE OR REPLACE TABLE colour_styles AS
SELECT a.id, t.term, sum(s.records) / any_value(n.n) * any_value(r.idf) AS w,
  any_value(n.dated) AS n
FROM styles s
JOIN same_sound_total n USING (artist_mbid)
JOIN same_sound_rarity r USING (style)
JOIN same_sound_styles t USING (style)
JOIN same_sound_artists a ON a.mbid = s.artist_mbid
WHERE n.n >= getvariable('same_sound_min_style_records')
GROUP BY a.id, t.term;
DROP TABLE same_sound_rarity;
DROP TABLE same_sound_total;

-- Each profile's length, for the cosine.
CREATE OR REPLACE TABLE colour_norms AS
SELECT id, sqrt(sum(dot_term(w * w))::DOUBLE) AS norm, any_value(n) AS n
FROM colour_styles GROUP BY id;

-- The candidates: an artist's neighbours of the co-listening, and the artists
-- whose neighbours it is. The second direction finds the heirs of an old,
-- famous artist, whose own neighbours are its era's canon: of the 18 judged
-- pairs found only that way, 17 were good (2026-10-09). A pair found both ways
-- keeps its higher score.
CREATE OR REPLACE TABLE same_sound_colisten AS
SELECT a.id AS a, n.id AS b, c.score
FROM colisten c
JOIN same_sound_artists a ON a.mbid = c.artist_mbid
JOIN same_sound_artists n ON n.mbid = c.neighbour_mbid;
CREATE OR REPLACE TABLE same_sound_candidates AS
SELECT a, b, max(score) AS colisten_score FROM (
  SELECT a, b, score FROM same_sound_colisten
  UNION ALL
  SELECT b, a, score FROM same_sound_colisten
) GROUP BY a, b;
DROP TABLE same_sound_colisten;

-- The colour two candidates share: their Discogs styles, when both have a
-- profile and share a style; else none.
CREATE OR REPLACE TABLE same_sound_shared AS
SELECT p.a, p.b, p.colisten_score, sum(dot_term(x.w * y.w))::DOUBLE AS x
FROM same_sound_candidates p
JOIN colour_styles x ON x.id = p.a
JOIN colour_styles y ON y.id = p.b AND y.term = x.term
GROUP BY p.a, p.b, p.colisten_score;
DROP TABLE same_sound_candidates;

-- The candidates whose colour agrees.
CREATE OR REPLACE TABLE same_sound_pairs AS
SELECT s.a, s.b, s.colisten_score,
  s.x / (na.norm * nb.norm) * nb.n / (nb.n + getvariable('same_sound_styles_shrink')) AS colour
FROM same_sound_shared s
JOIN colour_norms na ON na.id = s.a
JOIN colour_norms nb ON nb.id = s.b
WHERE colour >= getvariable('same_sound_min_colour');
DROP TABLE same_sound_shared;
DROP TABLE colour_norms;

-- Ranked from 1 by the colour, a tie falling to the neighbour's MBID, each
-- with its reason: the style that weighs most in what the two share, with the
-- artist's decade with the most of its records in it, NULL when none is
-- dated. `source` names the colour, always 'styles': the column stays,
-- artist_same_sound returns it and its signature is a contract
-- (docs/conception.md §4).
CREATE OR REPLACE TABLE same_sound AS
WITH reasons AS (
  SELECT p.a, p.b, x.term
  FROM same_sound_pairs p
  JOIN colour_styles x ON x.id = p.a
  JOIN colour_styles y ON y.id = p.b AND y.term = x.term
  QUALIFY row_number() OVER (
    PARTITION BY p.a, p.b ORDER BY dot_term(x.w * y.w) DESC, x.term) = 1
),
decades AS (
  SELECT artist_mbid, style, decade FROM styles WHERE decade IS NOT NULL
  QUALIFY row_number() OVER (
    PARTITION BY artist_mbid, style ORDER BY records DESC, decade) = 1
)
SELECT ma.mbid AS artist_mbid, mb.mbid AS neighbour_mbid,
  row_number() OVER (
    PARTITION BY p.a ORDER BY p.colour DESC, mb.mbid)::INTEGER AS rank,
  p.colisten_score, 'styles' AS source, p.colour, t.style AS term, d.decade
FROM same_sound_pairs p
JOIN reasons r USING (a, b)
JOIN same_sound_styles t ON t.term = r.term
JOIN same_sound_artists ma ON ma.id = p.a
JOIN same_sound_artists mb ON mb.id = p.b
LEFT JOIN decades d ON d.artist_mbid = ma.mbid AND d.style = t.style;

-- The work tables, freed for the rest of the build, as 84_discogs.sql frees
-- discogs_work.
DROP TABLE same_sound_pairs;
DROP TABLE colour_styles;
DROP TABLE same_sound_styles;
DROP TABLE same_sound_artists;
RESET preserve_insertion_order;
