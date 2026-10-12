-- Every artist page has one slug, named by its MBID whether the antenna played
-- the artist or not; a row holds one only for a played artist without an MBID
-- (docs/vision.md §5). Idempotent.

-- A homonym's free suffix is looked up by prefix (artistSlugs.takenUnder):
-- the primary key's collation cannot serve LIKE 'base-%'.
CREATE INDEX IF NOT EXISTS artist_slug_slug_pattern ON artist_slug (slug text_pattern_ops);

-- Where a played artist's MBID page already had a slug (given at the indexing
-- threshold before the artist got its MBID, suffixed since the row held the
-- name: Tocotronic's tocotronic-2), the page takes the plainer one and the row
-- keeps the other, which answers a 301 to it. Only when the row's is the
-- shorter, so a second run changes nothing.
DO $$
DECLARE p record;
BEGIN
  FOR p IN
    SELECT a.id, a.mbid, own.slug AS own_slug, m.slug AS mbid_slug
    FROM artist a
    JOIN artist_slug own ON own.artist_id = a.id
    JOIN artist_slug m ON m.mbid = a.mbid
    WHERE length(own.slug) < length(m.slug)
  LOOP
    DELETE FROM artist_slug WHERE slug = p.mbid_slug;
    UPDATE artist_slug SET mbid = p.mbid, artist_id = NULL WHERE slug = p.own_slug;
    INSERT INTO artist_slug (slug, artist_id) VALUES (p.mbid_slug, p.id);
  END LOOP;
END $$;

-- Every other played artist's slug becomes its MBID page's, so the address
-- already shared stays.
UPDATE artist_slug s
SET mbid = a.mbid, artist_id = NULL
FROM artist a
WHERE s.artist_id = a.id
  AND a.mbid IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM artist_slug o WHERE o.mbid = a.mbid);
