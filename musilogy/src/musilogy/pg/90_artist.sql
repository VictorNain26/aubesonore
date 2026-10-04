-- What the site reads for an artist. Functions rather than direct reads of
-- the tables: the site depends on these signatures, not on how the tables are
-- laid out, and every query it runs is tested here against Postgres.

-- proximity_surveyed says whether the artist was asked about in the pinned
-- proximity snapshot: only artists with 500 listeners or more are, so an
-- artist not surveyed is not an artist without neighbours. NULL while no
-- snapshot is loaded, which is the case until the proximity table lands
-- (docs/conception.md, section 2): it will then read true or false from the
-- artists the snapshot asked about.
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
         p.listen_count, p.user_count, NULL::boolean
  FROM musilogy.artists a
  LEFT JOIN musilogy.popularity p USING (mbid)
  WHERE a.mbid = artist;
$$;

-- Every typed link of an artist, read from its side: `forward` when the
-- artist is the source of the MusicBrainz relation, `backward` when it is the
-- target. The type keeps MusicBrainz's name; the front words it.
CREATE FUNCTION musilogy.artist_links(artist text)
RETURNS TABLE (
  type text,
  direction text,
  other_mbid text,
  other_name text,
  other_disambiguation text,
  other_y0 integer,
  y_begin integer,
  y_end integer
)
LANGUAGE sql STABLE
AS $$
  SELECT l.type, 'forward', o.mbid, o.name, o.disambiguation, o.y0, l.y_begin, l.y_end
  FROM musilogy.links l JOIN musilogy.artists o ON o.mbid = l.dst_mbid
  WHERE l.src_mbid = artist
  UNION ALL
  SELECT l.type, 'backward', o.mbid, o.name, o.disambiguation, o.y0, l.y_begin, l.y_end
  FROM musilogy.links l JOIN musilogy.artists o ON o.mbid = l.src_mbid
  WHERE l.dst_mbid = artist
  ORDER BY 1, 2, 7 NULLS LAST, 3;
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
