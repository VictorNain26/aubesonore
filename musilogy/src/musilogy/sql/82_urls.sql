-- The web pages an artist page uses, among those MusicBrainz relates to an
-- artist: where to listen (Deezer, Spotify, Apple Music, Bandcamp,
-- SoundCloud, whatever the relation type says of them), the official site and
-- the Wikidata item, from which the site reaches the Wikipedia article.
-- Discogs, Wikipedia, images, VIAF, IMDb, social networks and the other
-- databases stay out: no page shows them, and the dump keeps them.
--
-- MusicBrainz marks a relation `ended` when the page no longer belongs to the
-- artist (a closed account): kept, flagged. The same page related twice under
-- one type is one row, ended only when every occurrence is.
CREATE OR REPLACE TABLE urls AS
WITH related AS (
  SELECT r.mbid AS artist_mbid, t.u.type, t.u.url, t.u.ended,
    lower(regexp_extract(t.u.url, '^[a-zA-Z]+://([^/:?#]+)', 1)) AS host
  FROM raw_artists r, UNNEST(r.urls) AS t(u)
  WHERE t.u.url IS NOT NULL
)
SELECT artist_mbid, type, url, bool_and(coalesce(ended, false)) AS ended
FROM related u
WHERE EXISTS (SELECT 1 FROM artists a WHERE a.mbid = u.artist_mbid)
  AND (
    u.type IN ('official homepage', 'wikidata')
    OR EXISTS (
      SELECT 1
      FROM (VALUES ('deezer.com'), ('spotify.com'), ('apple.com'), ('bandcamp.com'),
                   ('soundcloud.com')) AS p(domain)
      WHERE u.host = p.domain OR u.host LIKE '%.' || p.domain)
  )
GROUP BY artist_mbid, type, url;
