-- What the site reads for an artist. Functions rather than direct reads of
-- the tables: the site depends on these signatures, not on how the tables are
-- laid out, and every query it runs is tested here against Postgres.

-- proximity_surveyed says whether the artist was asked about by a pinned
-- part of the proximity survey (89_proximity.sql): only artists with 500 listeners or
-- more are, so an artist not surveyed is not an artist without neighbours.
-- NULL when the load carries no snapshot.
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
  user_count bigint,
  proximity_surveyed boolean
)
LANGUAGE sql STABLE
AS $$
  SELECT a.mbid, a.name, a.disambiguation, a.type, a.country, a.begin_area, a.y_birth,
         a.y0, a.y0_source, a.y_end, a.y_end_source, a.ended, a.genres, a.genre_source,
         p.listen_count, p.user_count, a.proximity_surveyed
  FROM musilogy.artists a
  LEFT JOIN musilogy.popularity p USING (mbid)
  WHERE a.mbid = artist;
$$;

-- The influences Wikidata declares, both ways: 'cited' when the artist cites
-- the other, 'cited_by' when the other cites it. `statement` is the Wikidata
-- statement that says so, to cite it. Both ends are read from `artists`: an
-- artist absent from the dump has no influence here, as it has no card, and
-- an influence absent from it has no name to show. In time order within each
-- direction, an artist without a year last, then by mbid: a total order.
CREATE FUNCTION musilogy.artist_influences(artist text)
RETURNS TABLE (
  direction text,
  mbid text,
  name text,
  disambiguation text,
  y0 integer,
  statement text
)
LANGUAGE sql STABLE
AS $$
  SELECT 'cited', o.mbid, o.name, o.disambiguation, o.y0, i.statement
  FROM musilogy.artists a
  JOIN musilogy.influences i ON i.artist_mbid = a.mbid
  JOIN musilogy.artists o ON o.mbid = i.influence_mbid
  WHERE a.mbid = artist
  UNION ALL
  SELECT 'cited_by', o.mbid, o.name, o.disambiguation, o.y0, i.statement
  FROM musilogy.artists a
  JOIN musilogy.influences i ON i.influence_mbid = a.mbid
  JOIN musilogy.artists o ON o.mbid = i.artist_mbid
  WHERE a.mbid = artist
  ORDER BY 1, 5 NULLS LAST, 2;
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

-- The records a page shows of the artist's work (docs/vision.md §2.4), in the
-- order it was published: albums — studio, soundtrack, remix — and the EPs
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
  ORDER BY r.y NULLS LAST, r.title, r.rg_mbid;
$$;

-- Members of a group, or groups of a person: member of band, founder and
-- collaboration are one relation, being part of it (docs/vision.md §2.4).
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
    WHERE l.dst_mbid = artist AND l.type IN ('member of band', 'founder', 'collaboration')
    UNION ALL
    SELECT 'group', l.dst_mbid, l.y_begin, l.y_end
    FROM musilogy.links l
    WHERE l.src_mbid = artist AND l.type IN ('member of band', 'founder', 'collaboration')
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
    WHERE l.dst_mbid = artist AND l.type IN ('member of band', 'founder', 'collaboration')
  ),
  project AS (
    SELECT DISTINCT l.dst_mbid AS mbid, l.src_mbid AS via
    FROM musilogy.links l JOIN member m ON m.mbid = l.src_mbid
    WHERE l.type IN ('member of band', 'founder', 'collaboration', 'is person')
      AND l.dst_mbid <> artist
      AND NOT EXISTS (SELECT 1 FROM member o WHERE o.mbid = l.dst_mbid)
      AND NOT EXISTS (
        SELECT 1 FROM musilogy.links g
        WHERE g.src_mbid = artist AND g.dst_mbid = l.dst_mbid
          AND g.type IN ('member of band', 'founder', 'collaboration'))
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

-- An artist's ListenBrainz neighbours in the service's order, each with its
-- side in time (docs/conception.md, section 3): 'before' when it began more
-- than 3 years before the artist, 'after' more than 3 years after, 'during'
-- otherwise, NULL when either has no y0. Co-listening, never influence: the
-- side is the only reading time gives it. A neighbour absent from the dump has
-- no name to show and is left out, as is every neighbour of an artist the dump
-- lacks.
CREATE FUNCTION musilogy.artist_neighbours(artist text)
RETURNS TABLE (
  mbid text,
  name text,
  disambiguation text,
  type text,
  y0 integer,
  y_end integer,
  ended boolean,
  score integer,
  rank integer,
  side text
)
LANGUAGE sql STABLE
AS $$
  SELECT o.mbid, o.name, o.disambiguation, o.type, o.y0, o.y_end, o.ended, p.score, p.rank,
         CASE
           WHEN a.y0 IS NULL OR o.y0 IS NULL THEN NULL
           WHEN o.y0 < a.y0 - 3 THEN 'before'
           WHEN o.y0 > a.y0 + 3 THEN 'after'
           ELSE 'during'
         END
  FROM musilogy.artists a
  JOIN musilogy.proximity p ON p.artist_mbid = a.mbid
  JOIN musilogy.artists o ON o.mbid = p.neighbour_mbid
  WHERE a.mbid = artist
  ORDER BY p.rank;
$$;
