-- What the site reads for an artist. Functions rather than direct reads of
-- the tables: the site depends on these signatures, not on how the tables are
-- laid out, and every query it runs is tested here against Postgres.

CREATE FUNCTION musilogy.artist_card(artist text)
RETURNS TABLE (
  mbid text,
  name text,
  disambiguation text,
  type text,
  country text,
  begin_area text,
  y_birth integer,
  y0 integer,
  y0_source text,
  y_end integer,
  y_end_source text,
  ended boolean,
  genres jsonb,
  genre_source text,
  listen_count bigint,
  user_count bigint
)
LANGUAGE sql STABLE
AS $$
  SELECT a.mbid, a.name, a.disambiguation, a.type, a.country, a.begin_area, a.y_birth,
         a.y0, a.y0_source, a.y_end, a.y_end_source, a.ended, a.genres, a.genre_source,
         p.listen_count, p.user_count
  FROM musilogy.artists a
  LEFT JOIN musilogy.popularity p USING (mbid)
  WHERE a.mbid = artist;
$$;

-- The pages MusicBrainz relates to the artist and still holds as its own (an
-- ended relation is a page that no longer is). The type keeps MusicBrainz's
-- name; the site picks the platforms it shows.
CREATE FUNCTION musilogy.artist_urls(artist text)
RETURNS TABLE (type text, url text)
LANGUAGE sql STABLE
AS $$
  SELECT u.type, u.url FROM musilogy.urls u
  WHERE u.artist_mbid = artist AND NOT u.ended
  ORDER BY 1 NULLS LAST, 2;
$$;

-- The records a page shows of the artist's work (docs/vision.md §2.4), the
-- latest first: albums — studio, soundtrack, remix — and the EPs
-- released from the first album on; an artist with no album yet shows its
-- EPs. For a group whose end is declared, nothing released after that year
-- but what Wikidata files as a studio album or an EP: a posthumous record of
-- new music, not an archive. A record without a year shows only when Wikidata
-- files it so, last: undated records are mostly bootlegs (Kinfauns Demos,
-- Radiohead TV Covers), 3.8 % of the albums and 1.9 % of the EPs. Nothing
-- MusicBrainz does not show as the artist's work (`official` false, a bootleg
-- or a promotion) is on the page, nor dates its first album; a record whose
-- status is unknown stays.
CREATE FUNCTION musilogy.artist_releases(artist text)
RETURNS TABLE (
  mbid text,
  title text,
  primary_type text,
  soundtrack boolean,
  remix boolean,
  y integer
)
LANGUAGE sql STABLE
AS $$
  WITH r AS (SELECT * FROM musilogy.releases WHERE artist_mbid = artist AND official IS NOT FALSE),
  first_album AS (SELECT min(y) AS y FROM r WHERE primary_type = 'Album'),
  career AS (
    SELECT CASE WHEN y_end_source = 'declared' THEN y_end END AS y_end
    FROM musilogy.artists WHERE mbid = artist
  )
  SELECT r.rg_mbid, r.title, r.primary_type, r.soundtrack, r.remix, r.y
  FROM r, first_album f, career c
  WHERE (r.y IS NOT NULL OR r.filed_original)
    AND (r.primary_type = 'Album' OR f.y IS NULL OR r.y IS NULL OR r.y >= f.y)
    AND (c.y_end IS NULL OR r.y IS NULL OR r.y <= c.y_end OR r.filed_original)
  ORDER BY r.y DESC NULLS LAST, r.title, r.rg_mbid;
$$;

-- Being part of a group: member of band, founder and collaboration are one
-- relation (docs/vision.md §2.4). A simple immutable SQL function, inlined
-- into the queries that call it.
CREATE FUNCTION musilogy.is_part_of(relation text)
RETURNS boolean
LANGUAGE sql IMMUTABLE
AS $$
  SELECT relation IN ('member of band', 'founder', 'collaboration');
$$;

-- Members of a group, or groups of a person, through musilogy.is_part_of.
-- `role` reads from the artist's side: 'member' when the other is part of the
-- artist, 'group' when the artist is part of the other. Several relations
-- between the same two (two stints, a founder also a member) are one row, from
-- the earliest year declared to the latest: the dump says when a link ended,
-- not whether it did, so a stint still open beside a closed one reads closed.
-- Earliest first, an undated one last.
CREATE FUNCTION musilogy.artist_bands(artist text)
RETURNS TABLE (
  role text,
  mbid text,
  name text,
  disambiguation text,
  y0 integer,
  y_begin integer,
  y_end integer
)
LANGUAGE sql STABLE
AS $$
  WITH part AS (
    SELECT 'member' AS role, l.src_mbid AS other, l.y_begin, l.y_end
    FROM musilogy.links l
    WHERE l.dst_mbid = artist AND musilogy.is_part_of(l.type)
    UNION ALL
    SELECT 'group', l.dst_mbid, l.y_begin, l.y_end
    FROM musilogy.links l
    WHERE l.src_mbid = artist AND musilogy.is_part_of(l.type)
  )
  SELECT p.role, o.mbid, o.name, o.disambiguation, o.y0, min(p.y_begin), max(p.y_end)
  FROM part p JOIN musilogy.artists o ON o.mbid = p.other
  GROUP BY p.role, o.mbid, o.name, o.disambiguation, o.y0
  ORDER BY 1, 6 NULLS LAST, 3, 2;
$$;

-- The members' other groups and projects, two steps from a group: the other
-- groups each member is part of, and the names a member performs under. Only
-- those with a record a page shows (artist_releases), so that every link
-- leads to music; neither the artist itself, one of its members, one of its
-- former or later names (Warsaw for Joy Division), nor a project the artist
-- takes part in itself, which its own groups list (Stereolab in Uilab). `via`
-- names the members who lead there. Oldest first, by the year each began.
CREATE FUNCTION musilogy.artist_member_projects(artist text)
RETURNS TABLE (
  mbid text,
  name text,
  disambiguation text,
  y0 integer,
  via text[]
)
LANGUAGE sql STABLE
AS $$
  WITH member AS (
    SELECT DISTINCT l.src_mbid AS mbid
    FROM musilogy.links l
    WHERE l.dst_mbid = artist AND musilogy.is_part_of(l.type)
  ),
  project AS (
    SELECT DISTINCT l.dst_mbid AS mbid, l.src_mbid AS via
    FROM musilogy.links l JOIN member m ON m.mbid = l.src_mbid
    WHERE (musilogy.is_part_of(l.type) OR l.type = 'is person')
      AND l.dst_mbid <> artist
      AND NOT EXISTS (SELECT 1 FROM member o WHERE o.mbid = l.dst_mbid)
      AND NOT EXISTS (
        SELECT 1 FROM musilogy.links g
        WHERE g.src_mbid = artist AND g.dst_mbid = l.dst_mbid
          AND musilogy.is_part_of(g.type))
      AND NOT EXISTS (
        SELECT 1 FROM musilogy.links r
        WHERE r.type = 'artist rename'
          AND ((r.src_mbid = artist AND r.dst_mbid = l.dst_mbid)
            OR (r.dst_mbid = artist AND r.src_mbid = l.dst_mbid)))
  )
  SELECT o.mbid, o.name, o.disambiguation, o.y0, array_agg(v.name ORDER BY v.name, v.mbid)
  FROM project p
  JOIN musilogy.artists o ON o.mbid = p.mbid
  JOIN musilogy.artists v ON v.mbid = p.via
  WHERE EXISTS (SELECT 1 FROM musilogy.artist_releases(p.mbid))
  GROUP BY o.mbid, o.name, o.disambiguation, o.y0
  ORDER BY 4 NULLS LAST, 2, 1;
$$;

-- The artist's other names: the names a person performs under ('alias'), the
-- person behind a performance name ('person'), the name an artist bore before
-- ('former') and after ('later'). Oldest first.
CREATE FUNCTION musilogy.artist_other_names(artist text)
RETURNS TABLE (
  kind text,
  mbid text,
  name text,
  disambiguation text,
  y0 integer
)
LANGUAGE sql STABLE
AS $$
  WITH n AS (
    SELECT CASE l.type WHEN 'is person' THEN 'alias' ELSE 'later' END AS kind, l.dst_mbid AS other
    FROM musilogy.links l
    WHERE l.src_mbid = artist AND l.type IN ('is person', 'artist rename')
    UNION
    SELECT CASE l.type WHEN 'is person' THEN 'person' ELSE 'former' END, l.src_mbid
    FROM musilogy.links l
    WHERE l.dst_mbid = artist AND l.type IN ('is person', 'artist rename')
  )
  SELECT n.kind, o.mbid, o.name, o.disambiguation, o.y0
  FROM n JOIN musilogy.artists o ON o.mbid = n.other
  ORDER BY 5 NULLS LAST, 3, 2;
$$;

-- A neighbour's side in time (docs/conception.md, section 3): 'before' when it
-- began more than 3 years before the artist, 'after' more than 3 years after,
-- 'during' otherwise, NULL when either has no y0. Inlined, like is_part_of.
CREATE FUNCTION musilogy.side(artist_y0 integer, other_y0 integer)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE
    WHEN artist_y0 IS NULL OR other_y0 IS NULL THEN NULL
    WHEN other_y0 < artist_y0 - 3 THEN 'before'
    WHEN other_y0 > artist_y0 + 3 THEN 'after'
    ELSE 'during'
  END;
$$;

-- « Même son » (88_same_sound.sql, docs/vision.md §2.2): the artist's
-- neighbours of the co-listening whose colour agrees, the first 8 — the depth
-- the rule was measured at (2026-10-08); the table keeps them all — in their
-- rank order, each with its reason — the style, with the artist's decade, or
-- the genre (`source` says which) that weighs most in what the two share —
-- and its side in time (musilogy.side). Every neighbour is in the dump: a colour comes from
-- its styles or its genres, which only an artist of the dump has.
CREATE FUNCTION musilogy.artist_same_sound(artist text)
RETURNS TABLE (
  mbid text,
  name text,
  disambiguation text,
  type text,
  y0 integer,
  y_end integer,
  ended boolean,
  rank integer,
  source text,
  term text,
  decade integer,
  side text
)
LANGUAGE sql STABLE
AS $$
  SELECT o.mbid, o.name, o.disambiguation, o.type, o.y0, o.y_end, o.ended, s.rank,
         s.source, s.term, s.decade, musilogy.side(a.y0, o.y0)
  FROM musilogy.artists a
  JOIN musilogy.same_sound s ON s.artist_mbid = a.mbid
  JOIN musilogy.artists o ON o.mbid = s.neighbour_mbid
  WHERE a.mbid = artist AND s.rank <= 8
  ORDER BY s.rank;
$$;
