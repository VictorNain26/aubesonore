-- Links between artists: the relations a page shows (docs/vision.md §2.4).
-- Being part of a group — member of band, founder, collaboration, whose
-- source is the member — gives members, groups and the members' other
-- projects; `is person` (source: the person behind a performance name) and
-- `artist rename` (source: the former name) give the other names. Family,
-- teaching, touring musicians, tributes and the rest speak of a life, not of
-- the music: left in the dump, counted. Each link keeps its MusicBrainz type,
-- so a consumer tells what it asserts without trusting a category of ours.
--
-- The dump carries each relation on both of its artists, oriented by
-- `direction`: forward on the source, backward on the target. Reading it as
-- source -> target from either side gives the same row, and DISTINCT keeps
-- one. DISTINCT also collapses the relations MusicBrainz emits once per set
-- of attributes (one per instrument credited), which this table drops.
--
-- Years read with yr(), never a direct CAST: an illegible date ("????-01")
-- becomes NULL rather than a guess, and the relation survives without that
-- edge.
CREATE OR REPLACE TABLE link_candidates AS
SELECT DISTINCT
  CASE WHEN t.rel.direction = 'backward' THEN t.rel.mbid ELSE r.mbid END AS src_mbid,
  CASE WHEN t.rel.direction = 'backward' THEN r.mbid ELSE t.rel.mbid END AS dst_mbid,
  t.rel.type,
  yr(t.rel.begin) AS y_begin,
  yr(t.rel."end") AS y_end
FROM raw_artists r, UNNEST(r.relations) AS t(rel)
-- A relation without a target points at nothing: dropped.
WHERE t.rel.mbid IS NOT NULL;

CREATE OR REPLACE MACRO link_on_page(t) AS
  t IN ('member of band', 'founder', 'collaboration', 'is person', 'artist rename');

-- Both ends must be artists of this pipeline: a link is a way from one
-- artist to another, and an end outside `artists` has no name, no dates and
-- no genre to land on. The links cut, either way, are counted, not hidden.
CREATE OR REPLACE TABLE links AS
SELECT l.* FROM link_candidates l
WHERE link_on_page(l.type)
  AND EXISTS (SELECT 1 FROM artists a WHERE a.mbid = l.src_mbid)
  AND EXISTS (SELECT 1 FROM artists a WHERE a.mbid = l.dst_mbid);

CREATE OR REPLACE TABLE link_exclusions AS
SELECT
  count(*) FILTER (WHERE NOT link_on_page(l.type)) AS not_on_page,
  count(*) FILTER (
    WHERE link_on_page(l.type)
      AND (NOT EXISTS (SELECT 1 FROM artists a WHERE a.mbid = l.src_mbid)
        OR NOT EXISTS (SELECT 1 FROM artists a WHERE a.mbid = l.dst_mbid))
  ) AS to_unextracted_artist
FROM link_candidates l;
