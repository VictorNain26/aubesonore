-- Credited together (« Filiation », docs/vision.md §2.2): two artists of the
-- population credited as artists of one record, a fact, not a score. A record
-- is a release group of the work as MusicBrainz shows it (`releases`, a
-- bootleg or a promotion left out) or a Discogs record of the work
-- (84_discogs.sql: no compilation, mix or promotion). Each pair counts its
-- records in the source that has more of them, never the two summed: one
-- record is often in both. A record of more than ten credited artists is a
-- collective's, where a credit says little of each pair and the pairs grow
-- as its square: it does not count. A pair `links` already relates (a member
-- and its group, two names of one artist) is said there, not twice.
SET VARIABLE credits_max_artists = 10::INTEGER;

SET preserve_insertion_order = false;

CREATE OR REPLACE TABLE credits_musicbrainz AS
WITH r AS (
  SELECT rg_mbid, artist_mbid FROM releases WHERE official IS NOT FALSE
  QUALIFY count(*) OVER (PARTITION BY rg_mbid) <= getvariable('credits_max_artists')
)
SELECT x.artist_mbid, y.artist_mbid AS other_mbid, count(*) AS records
FROM r x JOIN r y ON x.rg_mbid = y.rg_mbid AND x.artist_mbid <> y.artist_mbid
GROUP BY ALL;

-- Counted on every artist Discogs credits on the record, linked to an MBID or not.
CREATE OR REPLACE TABLE credits_discogs AS
WITH small AS (
  SELECT record FROM discogs_record_artists GROUP BY record
  HAVING count(*) <= getvariable('credits_max_artists')
),
r AS (SELECT * FROM discogs_artist_records WHERE record IN (SELECT record FROM small))
SELECT x.mbid AS artist_mbid, y.mbid AS other_mbid, count(DISTINCT x.record) AS records
FROM r x JOIN r y ON x.record = y.record AND x.mbid <> y.mbid
GROUP BY ALL;

-- Both ways, so that the pair is left out by equalities: an OR in the join
-- would compare every credit with every link.
CREATE OR REPLACE TABLE credits_linked AS
SELECT src_mbid AS artist_mbid, dst_mbid AS other_mbid FROM links
UNION SELECT dst_mbid, src_mbid FROM links;

CREATE OR REPLACE TABLE credits AS
SELECT artist_mbid, other_mbid,
  greatest(coalesce(m.records, 0), coalesce(d.records, 0))::INTEGER AS records
FROM credits_musicbrainz m FULL JOIN credits_discogs d USING (artist_mbid, other_mbid)
ANTI JOIN credits_linked l USING (artist_mbid, other_mbid);

DROP TABLE credits_musicbrainz;
DROP TABLE credits_discogs;
DROP TABLE credits_linked;
RESET preserve_insertion_order;
