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
SELECT 'styles' AS source, a.artist_mbid, sqrt(sum(a.w * b.w * decade_kernel(a.decade, b.decade)))
  AS norm, any_value(a.n) AS n
FROM colour_styles a JOIN colour_styles b USING (artist_mbid, term)
GROUP BY a.artist_mbid
UNION ALL
SELECT 'genres', a.artist_mbid, sqrt(sum(a.w * b.w)), any_value(a.n)
FROM colour_genres a JOIN colour_genres b USING (artist_mbid, term)
GROUP BY a.artist_mbid;

-- The colour two artists share, for every pair of the co-listening: their
-- Discogs styles when both have a profile and share a style, in any decade;
-- else their genres when they share one; else none.
SET preserve_insertion_order = false;
CREATE OR REPLACE TABLE same_sound_colour AS
WITH shared AS (
  SELECT 'styles' AS source, p.artist_mbid, p.neighbour_mbid,
    sum(a.w * b.w * decade_kernel(a.decade, b.decade)) AS x
  FROM colisten p
  JOIN colour_styles a ON a.artist_mbid = p.artist_mbid
  JOIN colour_styles b ON b.artist_mbid = p.neighbour_mbid AND b.term = a.term
  GROUP BY ALL
  UNION ALL
  SELECT 'genres', p.artist_mbid, p.neighbour_mbid, sum(a.w * b.w)
  FROM colisten p
  JOIN colour_genres a ON a.artist_mbid = p.artist_mbid
  JOIN colour_genres b ON b.artist_mbid = p.neighbour_mbid AND b.term = a.term
  GROUP BY ALL
),
scored AS (
  -- A profile of undated records only has no length: no colour rather than
  -- 0 / 0, a NaN that DuckDB sorts above every number.
  SELECT s.source, s.artist_mbid, s.neighbour_mbid,
    CASE WHEN na.norm > 0 AND nb.norm > 0
      THEN s.x / (na.norm * nb.norm) * nb.n / (nb.n + CASE s.source
        WHEN 'styles' THEN getvariable('same_sound_styles_shrink')
        ELSE getvariable('same_sound_genres_shrink') END)
      ELSE 0 END AS colour
  FROM shared s
  JOIN colour_norms na ON na.source = s.source AND na.artist_mbid = s.artist_mbid
  JOIN colour_norms nb ON nb.source = s.source AND nb.artist_mbid = s.neighbour_mbid
)
SELECT artist_mbid, neighbour_mbid, source, colour FROM scored
QUALIFY row_number() OVER (
  PARTITION BY artist_mbid, neighbour_mbid ORDER BY source = 'styles' DESC) = 1;

-- The neighbours whose colour agrees, in the co-listening's order, ranked
-- again from 1. Each keeps its reason: the style (or genre) that weighs most
-- in what the two share, with the artist's decade for a style.
CREATE OR REPLACE TABLE same_sound_pairs AS
SELECT c.artist_mbid, c.neighbour_mbid, c.rank AS colisten_rank, s.source, s.colour
FROM colisten c JOIN same_sound_colour s USING (artist_mbid, neighbour_mbid)
WHERE s.colour >= getvariable('same_sound_min_colour');

CREATE OR REPLACE TABLE same_sound AS
WITH reasons AS (
  SELECT p.artist_mbid, p.neighbour_mbid, a.term, a.decade
  FROM same_sound_pairs p
  JOIN colour_styles a ON p.source = 'styles' AND a.artist_mbid = p.artist_mbid
  JOIN colour_styles b ON b.artist_mbid = p.neighbour_mbid AND b.term = a.term
  QUALIFY row_number() OVER (
    PARTITION BY p.artist_mbid, p.neighbour_mbid
    ORDER BY a.w * b.w * decade_kernel(a.decade, b.decade) DESC, a.term, a.decade NULLS LAST) = 1
  UNION ALL
  SELECT p.artist_mbid, p.neighbour_mbid, a.term, NULL
  FROM same_sound_pairs p
  JOIN colour_genres a ON p.source = 'genres' AND a.artist_mbid = p.artist_mbid
  JOIN colour_genres b ON b.artist_mbid = p.neighbour_mbid AND b.term = a.term
  QUALIFY row_number() OVER (
    PARTITION BY p.artist_mbid, p.neighbour_mbid ORDER BY a.w * b.w DESC, a.term) = 1
)
SELECT p.artist_mbid, p.neighbour_mbid,
  row_number() OVER (PARTITION BY p.artist_mbid ORDER BY p.colisten_rank)::SMALLINT AS rank,
  p.colisten_rank, p.source, p.colour, r.term, r.decade
FROM same_sound_pairs p JOIN reasons r USING (artist_mbid, neighbour_mbid);

DROP TABLE same_sound_pairs;
DROP TABLE same_sound_colour;
RESET preserve_insertion_order;
