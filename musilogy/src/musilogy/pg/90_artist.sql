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
