-- The neighbours ListenBrainz gives each artist it was asked about
-- (labs.api.listenbrainz.org/similar-artists, co-listening): `rank` is the
-- neighbour's place in the service's answer, from 1, `score` the service's
-- own. Proximity never says "influenced by"; time gives it a side, in the
-- function the site reads (pg/90_artist.sql). A neighbour absent from the dump
-- stays here: the function leaves it out, for want of a name to show.
--
-- The service sometimes gives one artist the same neighbour twice (5 of the
-- first 1 100 artists of the 2026-10-04 snapshot: will.i.am at ranks 58 and
-- 100 for 0145e155…). A repeated neighbour keeps its best occurrence, the
-- smallest rank — the highest score too, since scores never rise along the
-- ranks — and the rank it leaves free is not filled. The dropped occurrences
-- are counted, not hidden.
CREATE OR REPLACE TABLE proximity AS
SELECT r.artist_mbid, t.n.artist_mbid AS neighbour_mbid, t.n.score AS score,
       t.i::INTEGER AS rank
FROM raw_proximity r, UNNEST(r.neighbours) WITH ORDINALITY AS t(n, i)
QUALIFY row_number() OVER (PARTITION BY r.artist_mbid, t.n.artist_mbid ORDER BY t.i) = 1;

CREATE OR REPLACE TABLE proximity_exclusions AS
SELECT coalesce((SELECT sum(len(neighbours)) FROM raw_proximity), 0)
         - (SELECT count(*) FROM proximity) AS repeated_neighbour;

-- Only artists with 500 listeners or more were asked: an artist not surveyed
-- is not an artist without neighbours, and one surveyed with none is. True
-- for every artist the snapshot holds a line for, false for the others, NULL
-- everywhere when no snapshot was loaded.
ALTER TABLE artists ADD COLUMN proximity_surveyed BOOLEAN;
UPDATE artists SET proximity_surveyed = false WHERE EXISTS (SELECT 1 FROM raw_proximity);
UPDATE artists SET proximity_surveyed = true
FROM raw_proximity r WHERE r.artist_mbid = artists.mbid;
