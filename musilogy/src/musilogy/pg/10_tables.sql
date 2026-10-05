-- The tables the site reads, created in the staging schema the loader puts
-- first on the search_path. Identifiers are COLLATE "C": a tie broken "by
-- mbid" follows byte order, as in DuckDB, whatever the database's locale.
CREATE TABLE artists (
  mbid text COLLATE "C" PRIMARY KEY,
  name text NOT NULL,
  disambiguation text,
  name_key text,
  type text NOT NULL,
  y0_declared integer,
  y_end_declared integer,
  y_birth integer,
  ended boolean,
  country text,
  begin_area text,
  begin_area_mbid text COLLATE "C",
  genres_declared jsonb NOT NULL,
  y_first_album integer,
  y_last_album integer,
  genres_from_albums jsonb NOT NULL,
  genres jsonb NOT NULL,
  genre_source text,
  y0 integer,
  y0_source text,
  y_end integer,
  y_end_source text
);

CREATE TABLE genres (
  genre_mbid text COLLATE "C" PRIMARY KEY,
  name text NOT NULL,
  n_artists bigint NOT NULL
);

CREATE TABLE links (
  src_mbid text COLLATE "C" NOT NULL,
  dst_mbid text COLLATE "C" NOT NULL,
  type text NOT NULL,
  y_begin integer,
  y_end integer
);

CREATE TABLE popularity (
  mbid text COLLATE "C" PRIMARY KEY,
  listen_count bigint NOT NULL,
  user_count bigint NOT NULL,
  snapshot date NOT NULL
);

CREATE TABLE influences (
  artist_mbid text COLLATE "C" NOT NULL,
  influence_mbid text COLLATE "C" NOT NULL,
  statement text NOT NULL,
  PRIMARY KEY (artist_mbid, influence_mbid)
);

-- An artist's records (22_releases.sql), one row per credited artist.
CREATE TABLE releases (
  artist_mbid text COLLATE "C" NOT NULL,
  rg_mbid text COLLATE "C" NOT NULL,
  title text NOT NULL,
  primary_type text NOT NULL,
  soundtrack boolean NOT NULL,
  remix boolean NOT NULL,
  y integer,
  filed_original boolean NOT NULL,
  PRIMARY KEY (artist_mbid, rg_mbid)
);

-- The web pages an artist page uses (82_urls.sql).
CREATE TABLE urls (
  artist_mbid text COLLATE "C" NOT NULL,
  type text,
  url text NOT NULL,
  ended boolean NOT NULL
);

CREATE TABLE manifest (
  dump text NOT NULL,
  popularity_snapshot date,
  influences_snapshot date,
  discography_snapshot date,
  git_sha text NOT NULL,
  loaded_at timestamptz NOT NULL DEFAULT now()
);
