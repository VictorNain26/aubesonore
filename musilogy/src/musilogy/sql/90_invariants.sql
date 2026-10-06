-- Each view must be empty. The view's name is the invariant's name.
-- Unique and non-null mbid: a NULL mbid is a violation even
-- alone, group by NULL does not let it slip through under count(*) = 1.
CREATE OR REPLACE VIEW duplicate_artist AS
  SELECT mbid FROM artists GROUP BY mbid HAVING count(*) > 1 OR mbid IS NULL;
-- An absent comment is NULL, never ''. A consumer testing `IS NULL` to decide
-- whether two homonyms can be told apart would otherwise read the
-- artists whose dump record carries "" (1 407 587 on the reference dump,
-- descriptive) as distinguished.
CREATE OR REPLACE VIEW empty_disambiguation AS
  SELECT mbid FROM artists WHERE disambiguation = '';
-- [1850, 2026] is the reference dump's contractual window, hardcoded here on
-- purpose at BOTH ends, independently of the min_year/dump_year session
-- variables used by the production rules: this invariant re-asserts the
-- contractual bound, it must not read it back from the same variables the
-- production rules rely on, or a wrong variable value would satisfy both
-- silently. Moving to another dump therefore requires editing these literals
-- — that deliberate edit is the point of the invariant.
-- Only artists with a non-NULL y0 are subject to the window at all: the rest
-- of the population is published without any timeline claim.
CREATE OR REPLACE VIEW artist_out_of_window AS
  SELECT mbid FROM artists
  WHERE y0 IS NOT NULL AND (y0 < 1850 OR y0 > 2026);
-- Split in two: an end before the start and an end after the dump are
-- two unrelated anomalies, a single name would hide which one broke.
CREATE OR REPLACE VIEW end_before_begin AS
  SELECT mbid FROM artists WHERE y_end IS NOT NULL AND y0 IS NOT NULL AND y_end < y0;
CREATE OR REPLACE VIEW end_after_dump_year AS
  SELECT mbid FROM artists
  WHERE y_end_declared IS NOT NULL AND y_end_declared > 2026;
-- The end's lower bound, twin of end_after_dump_year: both the declared end
-- and the published one are subject to it, y_last_album being already bounded
-- by album_out_of_window.
CREATE OR REPLACE VIEW end_before_min_year AS
  SELECT mbid FROM artists
  WHERE (y_end_declared IS NOT NULL AND y_end_declared < 1850)
     OR (y_end IS NOT NULL AND y_end < 1850);
-- y0/y_end_source (30_bands_lifespan.sql): a source is non-NULL exactly when
-- the value it names is non-NULL, and it must name the branch that actually
-- produced that value. Both views state that contract directly, on the
-- published columns alone: reusing the production expression would compare a
-- value to itself and stay empty however wrong the value is.
CREATE OR REPLACE VIEW y0_source_mismatch AS
  SELECT mbid FROM artists
  WHERE (y0 IS NULL) <> (y0_source IS NULL)
     OR (y0_source = 'declared' AND y0 IS DISTINCT FROM y0_declared)
     OR (y0_source = 'first_album' AND y0 IS DISTINCT FROM y_first_album)
     OR (y0_source IS NOT NULL AND y0_source NOT IN ('declared', 'first_album'));
CREATE OR REPLACE VIEW y_end_source_mismatch AS
  SELECT mbid FROM artists
  WHERE (y_end IS NULL) <> (y_end_source IS NULL)
     OR (y_end_source = 'declared' AND y_end IS DISTINCT FROM y_end_declared)
     OR (y_end_source = 'last_album' AND y_end IS DISTINCT FROM y_last_album)
     OR (y_end_source IS NOT NULL AND y_end_source NOT IN ('declared', 'last_album'));
-- Same idiom as last_album_mismatch below, for its twin y_first_album.
CREATE OR REPLACE VIEW first_album_mismatch AS
  SELECT b.mbid FROM artists b
  WHERE b.y_first_album IS DISTINCT FROM
        (SELECT min(a.y) FROM albums a WHERE a.artist_mbid = b.mbid);
CREATE OR REPLACE VIEW last_album_mismatch AS
  SELECT b.mbid FROM artists b
  WHERE b.y_last_album IS DISTINCT FROM
        (SELECT max(a.y) FROM albums a WHERE a.artist_mbid = b.mbid);
-- NOT EXISTS, not NOT IN: a single NULL mbid returned by the subquery would
-- make NOT IN never true, silencing this invariant forever.
CREATE OR REPLACE VIEW album_without_artist AS
  SELECT rg_mbid FROM albums a
  WHERE NOT EXISTS (SELECT 1 FROM artists b WHERE b.mbid = a.artist_mbid);
-- The +/-5-year window around y0 is gone (albums no longer depend on y0):
-- only the contractual [1850, 2026] bound applies, hardcoded at both ends,
-- same reasoning as artist_out_of_window above.
CREATE OR REPLACE VIEW album_out_of_window AS
  SELECT a.rg_mbid FROM albums a
  WHERE a.y < 1850 OR a.y > 2026;
-- `albums` does not keep the secondary types; re-checked via
-- rg_mbid against raw_release_groups, which stays available after the build.
CREATE OR REPLACE VIEW album_extra_secondary_type AS
  SELECT a.rg_mbid FROM albums a JOIN raw_release_groups r ON r.mbid = a.rg_mbid
  WHERE len(list_filter(coalesce(r.secondary, []), s -> s NOT IN ('Soundtrack', 'Demo'))) > 0;
-- The extraction keeps EPs for the discography: an EP among `albums` would date
-- an artist by a release 20_albums.sql must not count. Read back from the raw
-- primary type, not from the filter that produced the table.
CREATE OR REPLACE VIEW album_not_an_album AS
  SELECT a.rg_mbid FROM albums a JOIN raw_release_groups r ON r.mbid = a.rg_mbid
  WHERE r.primary_type IS DISTINCT FROM 'Album';
-- 22_releases.sql. extract.py keeps {Album, EP} and nothing states it in SQL:
-- hardcoded here like KEPT_TYPES in artist_unexpected_type, so widening the
-- discography is a deliberate edit of this literal.
CREATE OR REPLACE VIEW release_unexpected_type AS
  SELECT artist_mbid, rg_mbid FROM releases
  WHERE primary_type IS NULL OR primary_type NOT IN ('Album', 'EP');
-- NOT EXISTS, not NOT IN: see album_without_artist above, same NULL trap.
CREATE OR REPLACE VIEW release_without_artist AS
  SELECT artist_mbid, rg_mbid FROM releases r
  WHERE NOT EXISTS (SELECT 1 FROM artists a WHERE a.mbid = r.artist_mbid);
CREATE OR REPLACE VIEW duplicate_release AS
  SELECT artist_mbid, rg_mbid FROM releases GROUP BY ALL HAVING count(*) > 1;
-- 22_releases.sql keeps the records whose secondary types are at most
-- Soundtrack and Remix. Read back from the raw secondary types, not from the
-- two flags.
CREATE OR REPLACE VIEW release_extra_secondary_type AS
  SELECT x.artist_mbid, x.rg_mbid FROM releases x
  JOIN raw_release_groups r ON r.mbid = x.rg_mbid
  WHERE len(list_filter(coalesce(r.secondary, []), s -> s NOT IN ('Soundtrack', 'Remix'))) > 0
     OR x.soundtrack <> list_contains(coalesce(r.secondary, []), 'Soundtrack')
     OR x.remix <> list_contains(coalesce(r.secondary, []), 'Remix');
-- `filed_original` restated against the snapshot with a join, not the EXISTS
-- that produced it.
CREATE OR REPLACE VIEW release_filed_mismatch AS
  SELECT x.artist_mbid, x.rg_mbid FROM releases x
  LEFT JOIN (
    SELECT DISTINCT rg_mbid FROM raw_discography WHERE form IN ('studio', 'ep')
  ) d ON d.rg_mbid = x.rg_mbid
  WHERE x.filed_original <> (d.rg_mbid IS NOT NULL);
-- Each row's artist must be among the release group's own credits: a release
-- handed to the wrong artist passes the views above and fails here.
CREATE OR REPLACE VIEW release_uncredited AS
  SELECT x.artist_mbid, x.rg_mbid FROM releases x
  WHERE NOT EXISTS (
    SELECT 1 FROM raw_release_groups r
    WHERE r.mbid = x.rg_mbid AND list_contains(r.artists, x.artist_mbid));
-- Independent of the sort applied at construction time (10_bands.sql):
-- compares each adjacent pair, does not reuse artists' sort formula.
-- Both raw lists are checked; `genres` is one of them, which
-- genre_source_mismatch pins.
CREATE OR REPLACE VIEW artist_genres_out_of_order AS
  SELECT mbid FROM artists, (SELECT unnest([genres_declared, genres_from_albums]) AS l) AS t
  WHERE len(t.l) > 1
    AND EXISTS (
      SELECT 1 FROM range(1, len(t.l)) AS r(i)
      WHERE t.l[i + 1].votes > t.l[i].votes
         OR (t.l[i + 1].votes = t.l[i].votes AND t.l[i + 1].name < t.l[i].name)
    );
-- 25_band_genres.sql: genre_source is non-NULL exactly when a band has
-- genres, and it names the list `genres` was copied from; `albums` only
-- ever stands in for a band that declares nothing.
CREATE OR REPLACE VIEW genre_source_mismatch AS
  SELECT mbid FROM artists
  WHERE (len(genres) = 0) <> (genre_source IS NULL)
     OR (genre_source = 'declared' AND genres IS DISTINCT FROM genres_declared)
     OR (genre_source = 'albums'
         AND (genres IS DISTINCT FROM genres_from_albums OR len(genres_declared) > 0))
     OR (genre_source IS NOT NULL AND genre_source NOT IN ('declared', 'albums'));
-- Recomputed from the release-groups themselves, with the votes summed by a
-- GROUP BY rather than read back from artist_album_genres.
CREATE OR REPLACE VIEW genres_from_albums_mismatch AS
  WITH expected AS (
    SELECT artist_mbid AS mbid, list_sort(list({'mbid': genre, 'votes': votes})) AS l
    FROM (
      SELECT a.artist_mbid, t.g.mbid AS genre, sum(t.g.votes)::INTEGER AS votes
      FROM albums a
      JOIN raw_release_groups r ON r.mbid = a.rg_mbid,
           UNNEST(coalesce(r.genres, [])) AS t(g)
      GROUP BY ALL
    )
    GROUP BY artist_mbid
  )
  SELECT b.mbid FROM artists b LEFT JOIN expected e USING (mbid)
  WHERE list_sort(list_transform(b.genres_from_albums, x -> {'mbid': x.mbid, 'votes': x.votes}))
        IS DISTINCT FROM coalesce(e.l, []);
-- NOT EXISTS, not NOT IN: see album_without_artist above, same NULL trap.
CREATE OR REPLACE VIEW unknown_genre AS
  SELECT t.g.mbid FROM (SELECT unnest(genres) AS g FROM artists) t
  WHERE NOT EXISTS (SELECT 1 FROM genres g WHERE g.genre_mbid = t.g.mbid);
-- Independent recomputation, same rationale as last_album_mismatch.
CREATE OR REPLACE VIEW genre_n_artists_mismatch AS
  SELECT g.genre_mbid FROM genres g
  WHERE g.n_artists <> (
    SELECT count(*) FROM artists b, UNNEST(b.genres) AS t(x) WHERE t.x.mbid = g.genre_mbid
  );
-- 80_links.sql. Both ends must be artists of this pipeline.
-- NOT EXISTS, not NOT IN: see album_without_artist above, same NULL trap.
CREATE OR REPLACE VIEW link_endpoint_missing AS
  SELECT src_mbid, dst_mbid, type FROM links l
  WHERE NOT EXISTS (SELECT 1 FROM artists a WHERE a.mbid = l.src_mbid)
     OR NOT EXISTS (SELECT 1 FROM artists a WHERE a.mbid = l.dst_mbid);
-- The relations a page shows, restated as a literal rather than through the
-- macro that filtered them: widening the links is a deliberate edit of both.
CREATE OR REPLACE VIEW link_unexpected_type AS
  SELECT src_mbid, dst_mbid, type FROM links
  WHERE type NOT IN ('member of band', 'founder', 'collaboration', 'is person', 'artist rename');
-- A link names two artists and what relates them; none of the three may be
-- absent. Stated on the published columns, not on the WHERE that filtered.
CREATE OR REPLACE VIEW link_incomplete AS
  SELECT src_mbid, dst_mbid, type FROM links
  WHERE src_mbid IS NULL OR dst_mbid IS NULL OR type IS NULL;
-- The de-duplication restated as a contract on the published rows, counting
-- them instead of reapplying the DISTINCT that produced them. NULL years group
-- together here exactly as DISTINCT collapses them.
CREATE OR REPLACE VIEW duplicate_link AS
  SELECT src_mbid, dst_mbid, type, y_begin, y_end FROM links
  GROUP BY ALL HAVING count(*) > 1;
-- The orientation, checked as an existence rather than by the CASE that
-- produced it: a link src -> dst must be read forward on src or backward on
-- dst. A swapped CASE publishes every link reversed, which passes the three
-- views above and fails here.
CREATE OR REPLACE VIEW link_misoriented AS
  SELECT l.src_mbid, l.dst_mbid, l.type FROM links l
  WHERE NOT EXISTS (
      SELECT 1 FROM raw_artists r, UNNEST(r.relations) AS t(x)
      WHERE r.mbid = l.src_mbid AND t.x.mbid = l.dst_mbid
        AND t.x.type = l.type AND t.x.direction = 'forward')
    AND NOT EXISTS (
      SELECT 1 FROM raw_artists r, UNNEST(r.relations) AS t(x)
      WHERE r.mbid = l.dst_mbid AND t.x.mbid = l.src_mbid
        AND t.x.type = l.type AND t.x.direction = 'backward');
-- 82_urls.sql. NOT EXISTS, not NOT IN: see album_without_artist above.
CREATE OR REPLACE VIEW url_without_artist AS
  SELECT artist_mbid, url FROM urls u
  WHERE NOT EXISTS (SELECT 1 FROM artists a WHERE a.mbid = u.artist_mbid);
-- The GROUP BY restated as a contract on the published rows.
CREATE OR REPLACE VIEW duplicate_url AS
  SELECT artist_mbid, type, url FROM urls GROUP BY ALL HAVING count(*) > 1;
-- 82_urls.sql keeps the pages an artist page uses. The scope restated with
-- string functions rather than the regular expression that produced it, the
-- domains hardcoded like every contractual bound: widening it is a deliberate
-- edit of this literal.
CREATE OR REPLACE VIEW url_out_of_scope AS
  SELECT u.artist_mbid, u.url FROM (
    SELECT artist_mbid, type, url,
      string_split(split_part(split_part(split_part(split_part(
        split_part(lower(url), '://', 2), '/', 1), '?', 1), '#', 1), ':', 1), '.') AS labels
    FROM urls
  ) u
  WHERE u.type NOT IN ('official homepage', 'wikidata', 'wikipedia', 'image')
    -- Every suffix of the host, "music.apple.com" -> [music.apple.com,
    -- apple.com, com]: a list test, where a join on LIKE would be a nested loop.
    AND NOT list_has_any(
      list_transform(range(1, len(u.labels) + 1), i -> array_to_string(u.labels[i:], '.')),
      ['deezer.com', 'spotify.com', 'apple.com', 'bandcamp.com', 'soundcloud.com']);
-- Each row must be a relation the dump carries on that artist, with that type:
-- a page handed to another artist, or retyped, fails here.
CREATE OR REPLACE VIEW url_unsourced AS
  SELECT u.artist_mbid, u.url FROM urls u
  WHERE NOT EXISTS (
    SELECT 1 FROM raw_artists r, UNNEST(r.urls) AS t(x)
    WHERE r.mbid = u.artist_mbid AND t.x.url = u.url AND t.x.type IS NOT DISTINCT FROM u.type);
-- corrections.csv holds at most 50 rows; materialized even empty
-- by apply_corrections, so available without depending on the dump.
CREATE OR REPLACE VIEW corrections_file_too_large AS
  SELECT count(*) AS n FROM corrections HAVING count(*) > 50;
-- A row that touches no raw_artists, or carries a field outside {begin,
-- end}, is loaded (counts toward the 50-row cap) without ever changing
-- anything: a silent no-op, not a correction.
-- NOT EXISTS for the mbid check, not NOT IN: see album_without_artist above,
-- same NULL trap (raw_artists.mbid is never NULL in practice, but nothing
-- guarantees it, and this check must not rely on that).
CREATE OR REPLACE VIEW corrections_invalid AS
  SELECT c.mbid, c.field FROM corrections c
  WHERE c.field NOT IN ('begin', 'end')
     OR NOT EXISTS (SELECT 1 FROM raw_artists r WHERE r.mbid = c.mbid);
-- MusicBrainz's six artist types, or none. A seventh would reach the dates
-- unread: formed() and the person rules know only these.
CREATE OR REPLACE VIEW artist_unexpected_type AS
  SELECT mbid FROM artists
  WHERE type NOT IN ('Group', 'Orchestra', 'Choir', 'Person', 'Character', 'Other');
-- extract.py leaves out the special purpose artists, and nothing states it in
-- SQL: hardcoded here like every other contractual bound.
CREATE OR REPLACE VIEW special_purpose_artist AS
  SELECT mbid FROM artists WHERE mbid IN (
    'f731ccc4-e22a-43af-a747-64213329e088', '33cf029c-63b0-41a0-9855-be2a3665fb3b',
    '314e1c25-dde7-4e4d-b2f4-0a7b9f7c56dc', 'eec63d3c-3b81-4ad4-b1e4-7c147d4d2b61',
    '9be7f096-97ec-4615-8957-8d40b5dcbc41', '125ec42a-7229-4250-afc5-e057484327fe',
    '89ad4ac3-39f7-470e-963a-56509c546377', '7e84f845-ac16-41fe-9ff8-df12eb32af55',
    '66ea0139-149f-4a0c-8fbf-5ea9ec4a6e49', 'a0ef7e1d-44ff-4039-9435-7d5fefdeecc9',
    '90068d37-bae7-4292-be4a-704c145bd616', '80a8851f-444c-4539-892b-ad2a49292aa9');
-- 10_bands.sql: only a formation is a declared start. A begin that is a
-- birth, or may be one, never lands in y0_declared.
CREATE OR REPLACE VIEW begin_misread AS
  SELECT mbid FROM artists WHERE NOT formed(type) AND y0_declared IS NOT NULL;
-- 10_bands.sql: a person's begin is a birth. It must land in y_birth and never
-- in y0_declared, and no other type carries a y_birth. The readable birth is
-- read back from raw_artists, with 2026 hardcoded like every contractual
-- bound, so a y_birth that is dropped fails here as well as one that leaks.
CREATE OR REPLACE VIEW birth_misread AS
  SELECT a.mbid FROM artists a JOIN raw_artists r USING (mbid)
  WHERE (person(a.type) AND a.y0_declared IS NOT NULL)
     OR (NOT person(a.type) AND a.y_birth IS NOT NULL)
     OR (person(a.type)
         AND a.y_birth IS DISTINCT FROM
             CASE WHEN yr(r.begin) <= 2026 THEN yr(r.begin) END);
-- apply_corrections runs UPDATE ... FROM corrections: two rows for the same
-- (mbid, field) make the applied value depend on scan order. The file is empty
-- today, which is exactly when the contract is cheap to state.
CREATE OR REPLACE VIEW corrections_duplicate AS
  SELECT mbid, field FROM corrections GROUP BY mbid, field HAVING count(*) > 1;
-- Popularity: one row per artist, counts as ListenBrainz defines them. A
-- listener has at least one listen, so user_count can never exceed
-- listen_count: swapped columns fail here. No zero either, on the reference
-- snapshot: an unknown artist is null, dropped by 87_popularity.sql.
CREATE OR REPLACE VIEW duplicate_popularity AS
  SELECT mbid FROM popularity GROUP BY mbid HAVING count(*) > 1;
CREATE OR REPLACE VIEW popularity_out_of_range AS
  SELECT mbid FROM popularity
  WHERE listen_count IS NULL OR user_count IS NULL
     OR user_count < 1 OR user_count > listen_count;
-- An artist the snapshot never asked about: a snapshot taken on another
-- extraction, or truncated. Without this, a search would rank that artist
-- as unknown to ListenBrainz when nobody asked. A build without a snapshot
-- (synthetic builds) asks about no one, hence the guard on the variable.
CREATE OR REPLACE VIEW popularity_unrequested AS
  SELECT a.mbid FROM artists a
  WHERE getvariable('popularity_snapshot') IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM raw_popularity p WHERE p.artist_mbid = a.mbid);
-- 88_influences.sql: one statement per pair of MBIDs.
CREATE OR REPLACE VIEW duplicate_influence AS
  SELECT artist_mbid, influence_mbid FROM influences GROUP BY ALL HAVING count(*) > 1;
-- An MBID is a lowercase UUID, as MusicBrainz writes it and `artists` keys
-- it: anything else on Wikidata would join nothing, in silence. A statement
-- id names its item, then the statement: without it, nothing can be cited.
CREATE OR REPLACE VIEW influence_malformed AS
  SELECT artist_mbid, influence_mbid FROM influences
  WHERE NOT coalesce(regexp_full_match(
          artist_mbid, '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'), false)
     OR NOT coalesce(regexp_full_match(
          influence_mbid, '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'), false)
     OR NOT coalesce(regexp_full_match(statement, '[Qq][0-9]+\$.+'), false);
-- The orientation, restated against the snapshot: a published row must be the
-- pair its statement declares, read the same way. A swapped column in the rule
-- publishes every influence reversed, which the two views above do not see.
CREATE OR REPLACE VIEW influence_unsourced AS
  SELECT i.artist_mbid, i.influence_mbid FROM influences i
  WHERE NOT EXISTS (
    SELECT 1 FROM raw_influences r
    WHERE r.artist_mbid = i.artist_mbid AND r.influence_mbid = i.influence_mbid
      AND r.statement = i.statement);
-- 89_proximity.sql: the service answers at most 100 neighbours, ranked from 1.
CREATE OR REPLACE VIEW proximity_rank_out_of_range AS
  SELECT artist_mbid, neighbour_mbid FROM proximity
  WHERE rank IS NULL OR rank < 1 OR rank > 100;
-- Same shape as influence_malformed: an MBID that is not a lowercase UUID
-- joins nothing, in silence; a neighbour without a score cannot be ranked.
CREATE OR REPLACE VIEW proximity_malformed AS
  SELECT artist_mbid, neighbour_mbid FROM proximity
  WHERE NOT coalesce(regexp_full_match(
          artist_mbid, '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'), false)
     OR NOT coalesce(regexp_full_match(
          neighbour_mbid, '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'), false)
     OR score IS NULL;
-- The parts of the survey never ask the same artist twice: each part asks
-- only the artists the earlier ones did not (cli.snapshot_proximity).
CREATE OR REPLACE VIEW proximity_asked_twice AS
  SELECT artist_mbid FROM raw_proximity GROUP BY artist_mbid HAVING count(*) > 1;
-- 22_releases.sql: the official status survey asks each artist once.
CREATE OR REPLACE VIEW official_asked_twice AS
  SELECT artist_mbid FROM raw_official GROUP BY artist_mbid HAVING count(*) > 1;
-- The status restated record by record with EXISTS rather than the aggregate
-- that produced it: official only when a surveyed credited artist lists the
-- record, not official only when one was surveyed and none lists it, unknown
-- only when none was surveyed.
CREATE OR REPLACE VIEW official_unsourced AS
  SELECT DISTINCT r.rg_mbid FROM releases r
  WHERE CASE
    WHEN EXISTS (
      SELECT 1 FROM releases c JOIN raw_official o USING (artist_mbid)
      WHERE c.rg_mbid = r.rg_mbid AND list_contains(o.release_groups, r.rg_mbid))
    THEN r.official IS DISTINCT FROM true
    WHEN EXISTS (
      SELECT 1 FROM releases c JOIN raw_official o USING (artist_mbid)
      WHERE c.rg_mbid = r.rg_mbid AND o.release_groups IS NOT NULL)
    THEN r.official IS DISTINCT FROM false
    ELSE r.official IS NOT NULL
  END;
-- An artist is never its own neighbour.
CREATE OR REPLACE VIEW proximity_self AS
  SELECT artist_mbid, neighbour_mbid FROM proximity WHERE neighbour_mbid = artist_mbid;
-- One row per pair, once the repeats are gone.
CREATE OR REPLACE VIEW duplicate_proximity AS
  SELECT artist_mbid, neighbour_mbid FROM proximity GROUP BY ALL HAVING count(*) > 1;
-- The deduplication, restated against the snapshot with a GROUP BY rather
-- than the window that produced it: a published row must be an occurrence the
-- snapshot holds, at the pair's smallest rank, with its score. Keeping the
-- last occurrence instead, or a score shifted by one rank, fails here.
CREATE OR REPLACE VIEW proximity_unsourced AS
  WITH occurrences AS (
    SELECT r.artist_mbid, t.n.artist_mbid AS neighbour_mbid, t.n.score AS score, t.i AS rank
    FROM raw_proximity r, UNNEST(r.neighbours) WITH ORDINALITY AS t(n, i)
  ),
  best AS (
    SELECT artist_mbid, neighbour_mbid, min(rank) AS rank FROM occurrences GROUP BY ALL
  )
  SELECT p.artist_mbid, p.neighbour_mbid FROM proximity p
  WHERE NOT EXISTS (
    SELECT 1 FROM occurrences o JOIN best b USING (artist_mbid, neighbour_mbid, rank)
    WHERE o.artist_mbid = p.artist_mbid AND o.neighbour_mbid = p.neighbour_mbid
      AND o.rank = p.rank AND o.score = p.score);
-- One row per artist and label, per artist, decade and style.
CREATE OR REPLACE VIEW duplicate_label AS
  SELECT artist_mbid, label_id FROM labels GROUP BY ALL HAVING count(*) > 1;
CREATE OR REPLACE VIEW duplicate_style AS
  SELECT artist_mbid, decade, style FROM styles GROUP BY ALL HAVING count(*) > 1;
CREATE OR REPLACE VIEW label_without_artist AS
  SELECT artist_mbid, label_id FROM labels l
  WHERE NOT EXISTS (SELECT 1 FROM artists a WHERE a.mbid = l.artist_mbid);
CREATE OR REPLACE VIEW style_without_artist AS
  SELECT artist_mbid, style FROM styles s
  WHERE NOT EXISTS (SELECT 1 FROM artists a WHERE a.mbid = s.artist_mbid);
-- 84_discogs.sql: a label is a home from two records on, and the artist itself
-- is one of the label's artists. A threshold read as "one or more", or a crowd
-- counted on the linked artists only, fails here.
CREATE OR REPLACE VIEW label_below_home AS
  SELECT artist_mbid, label_id FROM labels WHERE records < 2 OR label_artists < 1;
-- A decade is a year of the window [1850, 2026] rounded down to ten, or NULL
-- for a record with no dated edition: hardcoded like every contractual bound.
CREATE OR REPLACE VIEW style_decade_malformed AS
  SELECT artist_mbid, decade FROM styles
  WHERE decade % 10 <> 0 OR decade NOT BETWEEN 1850 AND 2020 OR records < 1;
-- An artist reaches Discogs only through a Discogs page MusicBrainz relates to
-- it alone. Restated with string functions rather than the regular expression
-- that produced it: an artist whose every Discogs id is shared with another
-- MBID must carry no label and no style.
CREATE OR REPLACE VIEW discogs_link_ambiguous AS
  WITH ids AS (
    SELECT DISTINCT r.mbid,
      split_part(split_part(split_part(t.u.url, '/artist/', 2), '-', 1), '?', 1) AS discogs_id
    FROM raw_artists r, UNNEST(r.urls) AS t(u)
    WHERE t.u.type = 'discogs' AND t.u.url LIKE '%discogs.com/%artist/%'
  ),
  alone AS (
    SELECT mbid FROM ids
    WHERE discogs_id IN (SELECT discogs_id FROM ids GROUP BY 1 HAVING count(*) = 1)
  )
  SELECT artist_mbid FROM (SELECT artist_mbid FROM labels UNION SELECT artist_mbid FROM styles)
  WHERE artist_mbid NOT IN (SELECT mbid FROM alone);
