-- The search's projection: one narrow row per artist, with its listener
-- count beside it, laid out in name_key order. Read from `artists`, whose rows
-- carry their genres as JSON and their raw evidence, the prefix "a" (157 112
-- names) fetched 64 000 pages and took about a second; from this table, 2 300
-- pages and about 0.1 s (2026-10-04). COLLATE "C": a prefix is then a range of
-- the index, whatever the database's locale.
CREATE TABLE search AS
  SELECT a.name_key COLLATE "C" AS name_key, p.user_count, a.mbid
  FROM artists a
  LEFT JOIN popularity p USING (mbid)
  ORDER BY 1;
CREATE INDEX ON search (name_key);
