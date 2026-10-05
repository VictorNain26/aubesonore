-- Built after the bulk load: an index maintained row by row during the copy
-- would slow it for nothing.
CREATE INDEX ON links (src_mbid);
CREATE INDEX ON links (dst_mbid);
-- Who cites an artist (artist_influences, 'cited_by'); the primary key
-- serves whom it cites.
CREATE INDEX ON influences (influence_mbid);
-- artist_urls; artist_releases reads the primary key.
CREATE INDEX ON urls (artist_mbid);
ANALYZE;
