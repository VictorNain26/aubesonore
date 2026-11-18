-- Built after the bulk load: an index maintained row by row during the copy
-- would slow it for nothing.
CREATE INDEX ON links (src_mbid);
CREATE INDEX ON links (dst_mbid);
-- artist_urls; artist_releases reads the primary key.
CREATE INDEX ON urls (artist_mbid);
-- An artist's neighbours, read in their rank order (artist_same_sound,
-- artist_colisten), and its credits (artist_credits).
CREATE INDEX ON same_sound (artist_mbid, rank);
CREATE INDEX ON colisten (artist_mbid, rank);
CREATE INDEX ON credits (artist_mbid);
-- Only the tables of the schema being loaded: a bare ANALYZE walks the whole
-- database, and the load's role owns nothing else in it.
DO $$
DECLARE loaded regclass;
BEGIN
    FOR loaded IN
        SELECT oid FROM pg_class
        WHERE relnamespace = current_schema()::regnamespace AND relkind = 'r'
    LOOP
        EXECUTE format('ANALYZE %s', loaded);
    END LOOP;
END $$;
