-- « Même son » (docs/vision.md §2.2): a neighbour of the co-listening that
-- shares the artist's colour. Taste and colour must agree; measured on 61
-- reference artists against sourced descriptions of their sound (2026-10-08,
-- the rule `agree_0.35`): 81 % of the neighbours shown judged the same sound or
-- a kinship, none foreign, against 54 % for the co-listening alone. Neither
-- signal is shown alone: the styles alone stay below 40 % where the
-- co-listening has nothing to say. A derived table: it reads the sources'
-- tables and rewrites none (docs/conception.md §1).

SET VARIABLE same_sound_min_colour = 0.35::DOUBLE;
-- A profile of a few records matches anything: the similarity of a neighbour
-- whose profile counts n records (or votes) is shrunk by n / (n + shrink).
SET VARIABLE same_sound_styles_shrink = 10::INTEGER;
SET VARIABLE same_sound_genres_shrink = 3::INTEGER;
-- Under three style-records an artist has no Discogs colour, only genres.
SET VARIABLE same_sound_min_style_records = 3::INTEGER;

-- A style in the decade next to it counts half: the synth-pop of 1982 is not
-- that of 2015, but the 1980s run into the 1990s. A record without a decade
-- weighs in an artist's profile and never matches.
CREATE OR REPLACE MACRO decade_kernel(a, b) AS
  CASE WHEN a = b THEN 1.0 WHEN abs(a - b) = 10 THEN 0.5 ELSE 0.0 END;
-- One term of a dot product, exact from here on: doubles summed by parallel
-- threads add up in an order that changes from run to run, and so would the
-- colour, the pairs at the threshold and the delivery's bytes. Decimals add
-- up to the same value in any order.
CREATE OR REPLACE MACRO dot_term(x) AS CAST(x AS DECIMAL(38, 20));

-- The colour of an artist, from Discogs: the share of its style-records in
-- each style and decade, weighted by the style's rarity (Krautrock says much,
-- Rock almost nothing), so that a prolific artist does not win by sheer count.
CREATE OR REPLACE TABLE colour_styles AS
WITH total AS (SELECT artist_mbid, sum(records) AS n FROM styles GROUP BY 1),
rarity AS (
  SELECT style, ln((SELECT count(*) FROM total) / count(DISTINCT artist_mbid)) AS idf
  FROM styles GROUP BY 1
)
SELECT s.artist_mbid, s.style AS term, s.decade, s.records / t.n * r.idf AS w, t.n
FROM styles s JOIN total t USING (artist_mbid) JOIN rarity r USING (style)
WHERE t.n >= getvariable('same_sound_min_style_records');

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
SELECT v.artist_mbid, v.term, NULL::INTEGER AS decade,
  v.v / sum(v.v) OVER (PARTITION BY v.artist_mbid) * r.idf AS w,
  sum(v.v) OVER (PARTITION BY v.artist_mbid) AS n
FROM voted v JOIN rarity r USING (term);

-- Each profile's length, for the cosine.
CREATE OR REPLACE TABLE colour_norms AS
SELECT 'styles' AS source, a.artist_mbid,
  sqrt(sum(dot_term(a.w * b.w * decade_kernel(a.decade, b.decade)))::DOUBLE) AS norm,
  any_value(a.n) AS n
FROM colour_styles a JOIN colour_styles b USING (artist_mbid, term)
GROUP BY a.artist_mbid
UNION ALL
SELECT 'genres', a.artist_mbid, sqrt(sum(dot_term(a.w * b.w))::DOUBLE), any_value(a.n)
FROM colour_genres a JOIN colour_genres b USING (artist_mbid, term)
GROUP BY a.artist_mbid;

-- The colour two artists share, for every pair of the co-listening: their
-- Discogs styles when both have a profile and share a style, in any decade;
-- else their genres when they share one; else none. The genres are read only
-- for the pairs the styles leave without a word.
SET preserve_insertion_order = false;
CREATE OR REPLACE TABLE same_sound_shared AS
SELECT 'styles' AS source, p.artist_mbid, p.neighbour_mbid,
  sum(dot_term(a.w * b.w * decade_kernel(a.decade, b.decade)))::DOUBLE AS x
FROM colisten p
JOIN colour_styles a ON a.artist_mbid = p.artist_mbid
JOIN colour_styles b ON b.artist_mbid = p.neighbour_mbid AND b.term = a.term
GROUP BY ALL;

INSERT INTO same_sound_shared
SELECT 'genres', p.artist_mbid, p.neighbour_mbid, sum(dot_term(a.w * b.w))::DOUBLE
FROM colisten p
JOIN colour_genres a ON a.artist_mbid = p.artist_mbid
JOIN colour_genres b ON b.artist_mbid = p.neighbour_mbid AND b.term = a.term
WHERE NOT EXISTS (
  SELECT 1 FROM same_sound_shared s
  WHERE s.artist_mbid = p.artist_mbid AND s.neighbour_mbid = p.neighbour_mbid)
GROUP BY ALL;

-- The neighbours whose colour agrees, with their place in the co-listening. A
-- profile of undated records only has no length: no colour rather than 0 / 0,
-- a NaN that DuckDB sorts above every number.
CREATE OR REPLACE TABLE same_sound_pairs AS
SELECT c.artist_mbid, c.neighbour_mbid, c.rank AS colisten_rank, s.source, s.colour
FROM colisten c
JOIN (
  SELECT s.source, s.artist_mbid, s.neighbour_mbid,
    CASE WHEN na.norm > 0 AND nb.norm > 0
      THEN s.x / (na.norm * nb.norm) * nb.n / (nb.n + CASE s.source
        WHEN 'styles' THEN getvariable('same_sound_styles_shrink')
        ELSE getvariable('same_sound_genres_shrink') END)
      ELSE 0 END AS colour
  FROM same_sound_shared s
  JOIN colour_norms na ON na.source = s.source AND na.artist_mbid = s.artist_mbid
  JOIN colour_norms nb ON nb.source = s.source AND nb.artist_mbid = s.neighbour_mbid
) s USING (artist_mbid, neighbour_mbid)
WHERE s.colour >= getvariable('same_sound_min_colour');

-- Ranked again from 1 in the co-listening's order, each with its reason: the
-- style whose terms weigh most, summed over the decades, in what the two
-- share, with the artist's decade that weighs most within it; for genres, the
-- genre that weighs most.
CREATE OR REPLACE TABLE same_sound AS
WITH style_parts AS (
  SELECT p.artist_mbid, p.neighbour_mbid, a.term, a.decade,
    sum(dot_term(a.w * b.w * decade_kernel(a.decade, b.decade))) AS part
  FROM same_sound_pairs p
  JOIN colour_styles a ON a.artist_mbid = p.artist_mbid
  JOIN colour_styles b ON b.artist_mbid = p.neighbour_mbid AND b.term = a.term
  WHERE p.source = 'styles'
  GROUP BY ALL
),
style_totals AS (
  SELECT *, sum(part) OVER (PARTITION BY artist_mbid, neighbour_mbid, term) AS total
  FROM style_parts
),
reasons AS (
  SELECT artist_mbid, neighbour_mbid, term, decade FROM style_totals
  QUALIFY row_number() OVER (
    PARTITION BY artist_mbid, neighbour_mbid
    ORDER BY total DESC, term, part DESC, decade NULLS LAST) = 1
  UNION ALL
  SELECT p.artist_mbid, p.neighbour_mbid, a.term, NULL
  FROM same_sound_pairs p
  JOIN colour_genres a ON a.artist_mbid = p.artist_mbid
  JOIN colour_genres b ON b.artist_mbid = p.neighbour_mbid AND b.term = a.term
  WHERE p.source = 'genres'
  QUALIFY row_number() OVER (
    PARTITION BY p.artist_mbid, p.neighbour_mbid ORDER BY dot_term(a.w * b.w) DESC, a.term) = 1
)
SELECT p.artist_mbid, p.neighbour_mbid,
  row_number() OVER (PARTITION BY p.artist_mbid ORDER BY p.colisten_rank)::SMALLINT AS rank,
  p.colisten_rank, p.source, p.colour, r.term, r.decade
FROM same_sound_pairs p JOIN reasons r USING (artist_mbid, neighbour_mbid);

-- The profiles hold a row per artist, style and decade: freed for the rest of
-- the build, as 84_discogs.sql frees discogs_work.
DROP TABLE same_sound_pairs;
DROP TABLE same_sound_shared;
DROP TABLE colour_norms;
DROP TABLE colour_genres;
DROP TABLE colour_styles;
RESET preserve_insertion_order;
