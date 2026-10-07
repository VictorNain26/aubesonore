-- Discogs, read through MusicBrainz: an artist reaches its Discogs releases by
-- the Discogs page MusicBrainz relates to it. A Discogs artist related to two
-- MBIDs — a duplicate on either side — reaches neither, or its records would
-- count twice. An MBID may relate several Discogs artists, aliases Discogs
-- keeps apart: their records are the artist's.
CREATE OR REPLACE TABLE discogs_related AS
SELECT DISTINCT r.mbid, discogs_artist_id(t.u.url) AS discogs_id
FROM raw_artists r, UNNEST(r.urls) AS t(u)
WHERE t.u.type = 'discogs' AND EXISTS (SELECT 1 FROM artists a WHERE a.mbid = r.mbid);

CREATE OR REPLACE TABLE discogs_links AS
SELECT mbid, discogs_id FROM discogs_related
WHERE discogs_id IS NOT NULL
QUALIFY count(*) OVER (PARTITION BY discogs_id) = 1;

-- A record is a master, the work Discogs groups its editions under, or the
-- release itself when it has none (the dump writes master_id 0, or no
-- master_id at all): minus the release id, so the two numberings never meet.
-- A compilation, an unofficial release, a promotion, a sampler or a mix says
-- where music circulated, not where the artist made it: it does not count.
CREATE OR REPLACE MACRO discogs_in_work(descriptions) AS
  NOT list_has_any(coalesce(descriptions, []), ['Compilation', 'Unofficial Release',
    'Partially Unofficial', 'Promo', 'Sampler', 'Mixed', 'Mixtape', 'Partially Mixed']);
CREATE OR REPLACE MACRO discogs_year(released) AS
  CASE WHEN yr(released) BETWEEN getvariable('min_year') AND getvariable('dump_year')
       THEN yr(released) END;

-- The only read of the 19 million JSON lines: every table below, coverage
-- included, reads this one. A release out of the work keeps only its flag.
CREATE OR REPLACE TABLE discogs_work AS
SELECT in_work,
  CASE WHEN coalesce(master_id, 0) > 0 THEN master_id ELSE -id END AS record,
  CASE WHEN in_work THEN discogs_year(released) END AS y,
  CASE WHEN in_work THEN artists END AS artists,
  CASE WHEN in_work THEN labels END AS labels,
  CASE WHEN in_work THEN styles END AS styles
FROM (SELECT discogs_in_work(descriptions) AS in_work, * FROM raw_discogs);

CREATE OR REPLACE TABLE discogs_record_years AS
SELECT record, min(y) AS y FROM discogs_work WHERE in_work GROUP BY 1;

CREATE OR REPLACE TABLE discogs_record_artists AS
SELECT record, discogs_id FROM (
  SELECT record, UNNEST(artists) AS discogs_id FROM discogs_work WHERE in_work
) GROUP BY ALL;

CREATE OR REPLACE TABLE discogs_record_styles AS
SELECT record, style FROM (
  SELECT record, UNNEST(styles) AS style FROM discogs_work WHERE in_work
) GROUP BY ALL;

-- The labels of a record's first dated edition, or of all its editions when
-- none is dated: a reissue says who holds the catalogue today, not where the
-- artist made the record (Can's records come back on P-Vine and Warner).
-- "Not On Label" is how Discogs writes a self-release, never a label.
CREATE OR REPLACE TABLE discogs_record_labels AS
SELECT record, l.id AS label_id, l.name FROM (
  SELECT d.record, UNNEST(d.labels) AS l
  FROM discogs_work d
  JOIN discogs_record_years ry ON ry.record = d.record AND d.y IS NOT DISTINCT FROM ry.y
  WHERE d.in_work
)
WHERE NOT starts_with(l.name, 'Not On Label')
GROUP BY ALL;

-- The bridge every artist-side table reads: an MBID's records, through its
-- Discogs artists.
CREATE OR REPLACE TABLE discogs_artist_records AS
SELECT DISTINCT l.mbid, ra.record
FROM discogs_links l JOIN discogs_record_artists ra USING (discogs_id);

-- An artist's labels: those that carry at least two of its records, a home
-- rather than a passage. `label_artists` counts the artists the label is home
-- to: by MBID when Discogs is linked, so that aliases add up as they do for the
-- artist itself, by Discogs id otherwise, and Various, Unknown Artist and No
-- Artist aside (Discogs ids 194, 355 and 118760). A few dozen for a scene's
-- label, thousands for a major: a consumer reads it before it takes a shared
-- label for a shared scene. One name per label, the smallest the first
-- editions carry: Discogs spells a label differently across them.
CREATE OR REPLACE TABLE labels AS
WITH homes AS (
  SELECT rl.label_id, coalesce(l.mbid, ra.discogs_id::VARCHAR) AS artist,
    count(DISTINCT rl.record) AS records
  FROM discogs_record_labels rl
  JOIN discogs_record_artists ra USING (record)
  LEFT JOIN discogs_links l USING (discogs_id)
  WHERE ra.discogs_id NOT IN (194, 355, 118760)
  GROUP BY ALL
),
crowd AS (
  SELECT label_id, count(*) FILTER (WHERE records >= 2) AS label_artists FROM homes GROUP BY 1
),
names AS (SELECT label_id, min(name) AS label FROM discogs_record_labels GROUP BY 1)
SELECT ar.mbid AS artist_mbid, rl.label_id, n.label, count(DISTINCT rl.record) AS records,
  c.label_artists
FROM discogs_artist_records ar
JOIN discogs_record_labels rl USING (record)
JOIN crowd c USING (label_id)
JOIN names n USING (label_id)
GROUP BY ar.mbid, rl.label_id, n.label, c.label_artists
HAVING count(DISTINCT rl.record) >= 2;

-- An artist's styles by decade of first edition, each counted in records: a
-- current is read era by era (James Holden, progressive house in the 2000s,
-- experimental and techno in the 2010s). A record with no dated edition
-- counts under a NULL decade.
CREATE OR REPLACE TABLE styles AS
SELECT ar.mbid AS artist_mbid, ry.y // 10 * 10 AS decade, rs.style,
  count(DISTINCT rs.record) AS records
FROM discogs_artist_records ar
JOIN discogs_record_years ry USING (record)
JOIN discogs_record_styles rs USING (record)
GROUP BY ALL;

-- MusicBrainz is the authority on an artist's dates and Discogs never moves
-- them: a first record dated before the declared formation is counted, not
-- corrected. A one-year margin leaves out a formation dated at the end of the
-- year of its first single.
CREATE OR REPLACE TABLE discogs_date_disagreements AS
SELECT count(*) AS first_record_before_formation FROM (
  SELECT ar.mbid, min(ry.y) AS y
  FROM discogs_artist_records ar
  JOIN discogs_record_years ry USING (record)
  GROUP BY ar.mbid
) f JOIN artists a ON a.mbid = f.mbid
WHERE f.y < a.y0_declared - 1;

CREATE OR REPLACE TABLE discogs_coverage AS
SELECT
  count(*) AS releases,
  count(*) FILTER (WHERE NOT in_work) AS releases_out_of_work,
  (SELECT count(*) FROM discogs_record_years) AS records,
  (SELECT count(DISTINCT discogs_id) FROM discogs_related
   WHERE discogs_id NOT IN (SELECT discogs_id FROM discogs_links)) AS discogs_ids_ambiguous,
  (SELECT count(DISTINCT mbid) FROM discogs_links) AS artists_linked
FROM discogs_work;
