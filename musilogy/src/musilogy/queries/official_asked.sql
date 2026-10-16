-- The artists a new part of the MusicBrainz official status snapshot asks
-- about: at least 500 listeners and at least one album or EP in the extraction
-- (which keeps no other type), and asked by no pinned part yet. Below 500
-- listeners bootlegs are rare: the 31 played artists under 500 listeners show
-- 112 records, one of them a promotional EP (Cignol, The Cosmic Garden EP).
-- $popularity and $release_groups are the snapshot and extraction paths,
-- $asked the list of pinned parts.
SELECT p.artist_mbid
FROM read_ndjson($popularity, columns = {artist_mbid: 'VARCHAR', total_user_count: 'BIGINT'}) p
WHERE p.total_user_count >= 500
  AND p.artist_mbid IN (
    SELECT UNNEST(artists) FROM read_ndjson($release_groups, columns = {artists: 'VARCHAR[]'})
  )
  AND p.artist_mbid NOT IN (
    SELECT artist_mbid FROM read_ndjson($asked, columns = {artist_mbid: 'VARCHAR'})
  )
ORDER BY p.artist_mbid
