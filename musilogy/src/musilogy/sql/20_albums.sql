-- Secondary types are empty or drawn from {Soundtrack, Demo}. The
-- +/-5-year window around y0 that used to gate this table is gone: y0 is now
-- partly derived from albums (30_bands_lifespan.sql), so it cannot be used
-- here without creating a cycle.
--
-- Demo is accepted: among the artists owning both a demo and a studio album,
-- 61.7% released the demo first, a median of 3 years earlier — a demo is
-- contemporaneous evidence of early activity.
-- Live stays excluded on purpose: MusicBrainz dates a live release by its
-- publication, not by the performance (914 artists carry a live release dated
-- more than 20 years after their last studio album; titles such as "Live in
-- Paris (1966)" published in 2024). DJ-mix, Compilation and Remix stay
-- excluded too. Both figures are contractual, in tests/test_baseline.py.
CREATE OR REPLACE TABLE albums AS
SELECT
  b.mbid AS artist_mbid,
  r.mbid AS rg_mbid,
  r.title,
  yr(r.date) AS y,
  list_contains(coalesce(r.secondary, []), 'Soundtrack') AS soundtrack
FROM raw_release_groups r
JOIN artists b ON b.mbid = list_distinct(r.artists)[1]
-- The extraction keeps EPs too, for the discography (22_releases.sql); an EP
-- does not date an artist nor give it genres.
WHERE r.primary_type = 'Album'
  AND len(list_distinct(r.artists)) = 1
  AND yr(r.date) IS NOT NULL
  AND yr(r.date) BETWEEN getvariable('min_year') AND getvariable('dump_year')
  AND len(list_filter(coalesce(r.secondary, []), s -> s NOT IN ('Soundtrack', 'Demo'))) = 0;

ALTER TABLE artists ADD COLUMN y_first_album INTEGER;
ALTER TABLE artists ADD COLUMN y_last_album INTEGER;
UPDATE artists SET
  y_first_album = (SELECT min(a.y) FROM albums a WHERE a.artist_mbid = artists.mbid),
  y_last_album = (SELECT max(a.y) FROM albums a WHERE a.artist_mbid = artists.mbid);
