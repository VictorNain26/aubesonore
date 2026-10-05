-- The web pages MusicBrainz relates to an artist: streaming and download
-- stores, official site, Wikidata, Discogs… Each keeps MusicBrainz's relation
-- type, so a consumer tells a streaming page from a homepage without trusting a
-- category of ours, and which platforms a page shows is the consumer's choice.
--
-- MusicBrainz marks a relation `ended` when the page no longer belongs to the
-- artist (a closed account): kept, flagged. The same page related twice under
-- one type is one row, ended only when every occurrence is.
CREATE OR REPLACE TABLE urls AS
SELECT r.mbid AS artist_mbid, t.u.type, t.u.url, bool_and(coalesce(t.u.ended, false)) AS ended
FROM raw_artists r, UNNEST(r.urls) AS t(u)
WHERE t.u.url IS NOT NULL
  AND EXISTS (SELECT 1 FROM artists a WHERE a.mbid = r.mbid)
GROUP BY r.mbid, t.u.type, t.u.url;
