-- Influences declared on Wikidata: artist_mbid cites influence_mbid as an
-- influence ("influenced by", P737), and `statement` is the declaration that
-- says so, to cite it. An item can carry several MBIDs (P434): the snapshot
-- holds one row per statement and pair of MBIDs, and this table one statement
-- per pair — the smallest id when two declarations give the same pair, a total
-- order. Neither end has to be an artist of the dump: the functions the site
-- reads join `artists`, so a row with no name to show stays out of them, not
-- out of the table.
CREATE OR REPLACE TABLE influences AS
SELECT artist_mbid, influence_mbid, min(statement) AS statement
FROM raw_influences
GROUP BY artist_mbid, influence_mbid;
