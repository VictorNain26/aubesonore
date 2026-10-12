-- Every artist page has one slug, named by its MBID whether the antenna played
-- the artist or not; a row holds one only for a played artist without an MBID
-- (docs/vision.md §5). Idempotent.

-- A homonym's free suffix is looked up by prefix (artistSlugs.takenUnder):
-- the primary key's collation cannot serve LIKE 'base-%'.
CREATE INDEX IF NOT EXISTS artist_slug_slug_pattern ON artist_slug (slug text_pattern_ops);

-- A played artist's slug becomes its MBID page's, so the address already
-- shared stays. Where that page already had one (a page given its slug at the
-- indexing threshold before the artist got its MBID), the page keeps it and
-- the row's slug answers a 301 there.
UPDATE artist_slug s
SET mbid = a.mbid, artist_id = NULL
FROM artist a
WHERE s.artist_id = a.id
  AND a.mbid IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM artist_slug o WHERE o.mbid = a.mbid);
