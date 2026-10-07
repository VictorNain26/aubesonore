-- The genres an artist is found by. Most artists declare none while their
-- albums often do, so the rule is the one 30_bands_lifespan.sql applies to
-- dates: the declared evidence wins,
-- the albums take over. genre_source names the branch; both raw lists stay
-- published beside the result.
--
-- Album genres are summed over the artist's own albums, the ones 20_albums.sql
-- kept, so they rest on exactly the releases the other tables count. An
-- artist that declares genres never mixes in its albums': the two are votes on
-- different things, and a union would let one album outvote the band.
CREATE OR REPLACE TABLE artist_album_genres AS
SELECT a.artist_mbid AS mbid, t.g.mbid AS genre_mbid, any_value(t.g.name) AS name,
  sum(t.g.votes)::INTEGER AS votes
FROM albums a
JOIN raw_release_groups r ON r.mbid = a.rg_mbid,
     UNNEST(coalesce(r.genres, [])) AS t(g)
GROUP BY a.artist_mbid, t.g.mbid;

CREATE OR REPLACE TABLE artists AS
WITH from_albums AS (
  -- Same order as genres_declared (10_bands.sql): votes descending, then name.
  SELECT mbid,
    list_transform(
      list_sort(list({'k': [-votes], 'n': name, 'v': {'mbid': genre_mbid, 'name': name, 'votes': votes}})),
      y -> y.v
    ) AS genres_from_albums
  FROM artist_album_genres
  GROUP BY mbid
)
SELECT b.*,
  coalesce(f.genres_from_albums, []) AS genres_from_albums,
  CASE WHEN len(b.genres_declared) > 0 THEN b.genres_declared
       ELSE coalesce(f.genres_from_albums, []) END AS genres,
  CASE WHEN len(b.genres_declared) > 0 THEN 'declared'
       WHEN len(f.genres_from_albums) > 0 THEN 'albums' END AS genre_source
FROM artists b
LEFT JOIN from_albums f USING (mbid);
