-- Built after the bulk load: an index maintained row by row during the copy
-- would slow it for nothing.
CREATE INDEX ON links (src_mbid);
CREATE INDEX ON links (dst_mbid);
-- artist_urls; artist_releases reads the primary key.
CREATE INDEX ON urls (artist_mbid);
-- An artist's « Même son », read in its rank order (artist_same_sound).
CREATE INDEX ON same_sound (artist_mbid, rank);
ANALYZE;
