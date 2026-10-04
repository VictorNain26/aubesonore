-- Built after the bulk load: an index maintained row by row during the copy
-- would slow it for nothing.
CREATE INDEX ON links (src_mbid);
CREATE INDEX ON links (dst_mbid);
ANALYZE;
