import re
from dataclasses import dataclass

import duckdb
import pytest

from musilogy import build as build_module
from musilogy.build import INVARIANTS, build, check_invariants, scalar
from tests.conftest import FIX, SQL, violations

BEATLES = "b10bbbfc-cf9e-42e0-be17-e2c3e1d2600d"
JOY_DIVISION = "9a58fda3-f4ed-4080-a3a5-f457aac9fcdd"
VARIOUS_ARTISTS = "89ad4ac3-39f7-470e-963a-56509c546377"


@dataclass(frozen=True)
class Broken:
    """A table of the sample broken the way `why` says: `invariant` must report
    it, `rows` rows, where it reported none before."""

    invariant: str
    why: str
    mutation: tuple[str, ...]
    rows: int = 1


# A copy of an artist row with its mbid replaced: `NOT x IN (subquery)` is
# never true once the subquery returns a NULL, so every NOT IN check would
# fall silent on it.
NULL_MBID_ARTIST = (
    f"INSERT INTO artists SELECT * REPLACE (NULL AS mbid) FROM artists WHERE mbid = '{BEATLES}'"
)
# One link of the sample, alone for its pair of artists either way.
LONE_LINK = (
    "CREATE TEMP TABLE picked AS SELECT * FROM links WHERE src_mbid <> dst_mbid"
    " QUALIFY count(*) OVER"
    " (PARTITION BY least(src_mbid, dst_mbid), greatest(src_mbid, dst_mbid)) = 1"
    " ORDER BY ALL LIMIT 1"
)
FIRST_CREDIT = "rowid = (SELECT min(rowid) FROM credits)"
JOY_DIVISION_FIRST_SAME_SOUND = f"artist_mbid = '{JOY_DIVISION}' AND rank = 1"

CASES = [
    Broken(
        "duplicate_artist",
        "an mbid published twice",
        (f"INSERT INTO artists SELECT * FROM artists WHERE mbid = '{BEATLES}'",),
    ),
    Broken("duplicate_artist", "a NULL mbid is a violation even alone", (NULL_MBID_ARTIST,)),
    Broken(
        "artist_unexpected_type",
        "a seventh MusicBrainz type would reach the dates unread",
        (f"UPDATE artists SET type = 'Robot' WHERE mbid = '{BEATLES}'",),
    ),
    Broken(
        "special_purpose_artist",
        "extract.py leaves the special purpose artists out",
        (f"UPDATE artists SET mbid = '{VARIOUS_ARTISTS}' WHERE mbid = '{BEATLES}'",),
    ),
    Broken(
        "begin_misread",
        "a begin that may be a birth never starts the activity",
        (f"UPDATE artists SET type = NULL WHERE mbid = '{BEATLES}'",),
    ),
    Broken(
        "birth_misread",
        "a person's begin lands in y_birth, never in y0_declared",
        (
            "UPDATE artists SET y0_declared = 1990 WHERE mbid = "
            "(SELECT min(mbid) FROM artists WHERE type = 'Person')",
        ),
    ),
    Broken(
        "birth_misread",
        "no other type than a person carries a y_birth",
        (f"UPDATE artists SET y_birth = 1960 WHERE mbid = '{BEATLES}'",),
    ),
    Broken(
        "birth_misread",
        "a readable birth dropped on the way to y_birth",
        (
            "UPDATE artists SET y_birth = NULL WHERE mbid = "
            "(SELECT min(mbid) FROM artists WHERE type = 'Person' AND y_birth IS NOT NULL)",
        ),
    ),
    Broken(
        "artist_out_of_window",
        "a start before 1850, the window's lower end",
        (f"UPDATE artists SET y0 = 1849 WHERE mbid = '{BEATLES}'",),
    ),
    Broken(
        "end_before_begin",
        "an end the year before the start",
        (f"UPDATE artists SET y_end = y0 - 1 WHERE mbid = '{BEATLES}'",),
    ),
    Broken(
        "end_after_dump_year",
        "a declared end after 2026, the dump's year",
        (f"UPDATE artists SET y_end_declared = 2100 WHERE mbid = '{BEATLES}'",),
    ),
    Broken(
        "end_before_min_year",
        "four artists of the reference dump declare an end in 1537, 1761, 1781 and 1814",
        (f"UPDATE artists SET y_end_declared = 1537, y_end = 1537 WHERE mbid = '{BEATLES}'",),
    ),
    Broken(
        "y0_source_mismatch",
        "'declared' names a start that is not the declared one",
        (f"UPDATE artists SET y0 = y0 - 1 WHERE mbid = '{BEATLES}'",),
    ),
    Broken(
        "y0_source_mismatch",
        "a start without a source",
        (
            "UPDATE artists SET y0 = 1999 WHERE mbid = "
            "(SELECT min(mbid) FROM artists WHERE y0_source IS NULL)",
        ),
    ),
    Broken(
        "y_end_source_mismatch",
        "'declared' names an end that is not the declared one",
        (f"UPDATE artists SET y_end = y_end - 1 WHERE mbid = '{BEATLES}'",),
    ),
    Broken(
        "y_end_source_mismatch",
        # The shape of 265 published rows: y_end holds the declared begin while
        # y_end_source says 'last_album'. The invariant used to copy the
        # production expression, greatest(y_last_album, coalesce(y0_declared,
        # ...)), which returns exactly that wrong value.
        "'last_album' names the declared begin, not the last album",
        (
            "UPDATE artists SET y0_declared = 2005, y_first_album = NULL, y_last_album = 1959, "
            "y_end = 2005 WHERE mbid = "
            "(SELECT min(mbid) FROM artists WHERE y_end_source = 'last_album')",
        ),
    ),
    Broken(
        "first_album_mismatch",
        "a first album that is not the earliest of `albums`",
        (f"UPDATE artists SET y_first_album = y_first_album - 1 WHERE mbid = '{BEATLES}'",),
    ),
    Broken(
        "last_album_mismatch",
        "a last album that is not the latest of `albums`",
        (f"UPDATE artists SET y_last_album = y_last_album - 1 WHERE mbid = '{BEATLES}'",),
    ),
    Broken(
        "album_without_artist",
        "an album whose artist is not published",
        ("INSERT INTO albums VALUES ('inconnu', 'rg', 'T', 1999, false)",),
    ),
    Broken(
        "album_without_artist",
        "NOT EXISTS stays NULL-safe where NOT IN went silent",
        (NULL_MBID_ARTIST, "INSERT INTO albums VALUES ('inconnu', 'rg', 'T', 1999, false)"),
    ),
    Broken(
        "album_out_of_window",
        # 2027 is past 2026 for any album, whichever band it is.
        "an album after 2026, the window's upper end",
        ("UPDATE albums SET y = 2027 WHERE rg_mbid = (SELECT min(rg_mbid) FROM albums)",),
    ),
    Broken(
        "album_extra_secondary_type",
        "a live album is not part of the work",
        (
            "UPDATE raw_release_groups SET secondary = ['Live'] "
            "WHERE mbid = (SELECT min(rg_mbid) FROM albums)",
        ),
    ),
    Broken(
        "link_endpoint_missing",
        "a link to an artist that is not published",
        (f"INSERT INTO links VALUES ('{BEATLES}', 'inconnu', 'collaboration', NULL, NULL)",),
    ),
    Broken(
        "link_endpoint_missing",
        "NOT EXISTS stays NULL-safe where NOT IN went silent",
        (
            NULL_MBID_ARTIST,
            f"INSERT INTO links VALUES ('{BEATLES}', 'inconnu', 'collaboration', NULL, NULL)",
        ),
    ),
    Broken(
        "link_incomplete",
        "a link that does not say what relates the two",
        (f"INSERT INTO links VALUES ('{BEATLES}', '{BEATLES}', NULL, 1999, NULL)",),
    ),
    Broken(
        "link_unexpected_type",
        # A teacher link is in the dump but not on a page: widening
        # 80_links.sql without saying so here would publish it in silence.
        "a relation a page does not show",
        ("INSERT INTO links SELECT src_mbid, dst_mbid, 'teacher', NULL, NULL FROM links LIMIT 1",),
    ),
    Broken(
        "duplicate_link",
        # NULL years: a duplicate is caught on the triple alone, two NULL
        # edges grouped as the DISTINCT of 80_links.sql collapses them.
        "one relation published twice",
        (
            "INSERT INTO links SELECT src_mbid, dst_mbid, 'collaboration', NULL, NULL "
            "FROM (SELECT * FROM links LIMIT 1), range(2)",
        ),
    ),
    Broken(
        "link_misoriented",
        # Swapped end for end, the link keeps both ends among the artists and
        # stays unique: only the orientation check can tell.
        "a link read the wrong way round",
        (
            LONE_LINK,
            "DELETE FROM links USING picked p WHERE links.src_mbid = p.src_mbid "
            "AND links.dst_mbid = p.dst_mbid AND links.type = p.type",
            "INSERT INTO links SELECT dst_mbid, src_mbid, type, y_begin, y_end FROM picked",
        ),
    ),
    Broken(
        "duplicate_popularity",
        "two counts for one artist",
        (
            f"INSERT INTO popularity SELECT mbid, -1, user_count, snapshot FROM popularity "
            f"WHERE mbid = '{BEATLES}'",
        ),
    ),
    Broken(
        "popularity_out_of_range",
        "a listener has at least one listen: swapped counts",
        (
            "UPDATE popularity SET listen_count = user_count, user_count = listen_count "
            f"WHERE mbid = '{BEATLES}'",
        ),
    ),
    Broken(
        "popularity_unrequested",
        "an artist the snapshot never asked about",
        (f"DELETE FROM raw_popularity WHERE artist_mbid = '{BEATLES}'",),
    ),
    Broken(
        "same_sound_self",
        "an artist is never its own neighbour",
        (
            "UPDATE same_sound SET neighbour_mbid = artist_mbid "
            f"WHERE {JOY_DIVISION_FIRST_SAME_SOUND}",
        ),
    ),
    Broken(
        "same_sound_rank_out_of_range",
        "a rank past the 8 the page shows, after a gap",
        (f"UPDATE same_sound SET rank = 9 WHERE artist_mbid = '{JOY_DIVISION}' AND rank = 4",),
    ),
    Broken(
        "same_sound_out_of_order",
        "the first two neighbours swapped",
        (
            "UPDATE same_sound SET rank = 3 - rank "
            f"WHERE artist_mbid = '{JOY_DIVISION}' AND rank <= 2",
        ),
    ),
    Broken(
        "same_sound_score_out_of_range",
        "a colour of zero is no colour",
        (f"UPDATE same_sound SET score = 0 WHERE {JOY_DIVISION_FIRST_SAME_SOUND}",),
    ),
    Broken(
        "same_sound_unexplained",
        "a reason neither artist carries",
        (f"UPDATE same_sound SET term = 'Polka' WHERE {JOY_DIVISION_FIRST_SAME_SOUND}",),
    ),
    Broken(
        "duplicate_credit",
        "one pair published twice",
        (f"INSERT INTO credits SELECT * FROM credits WHERE {FIRST_CREDIT}",),
    ),
    Broken(
        "credit_self",
        "an artist is never credited with itself",
        (f"UPDATE credits SET other_mbid = artist_mbid WHERE {FIRST_CREDIT}",),
    ),
    Broken(
        "credit_one_way",
        "a pair read from one side only",
        (f"DELETE FROM credits WHERE {FIRST_CREDIT}",),
    ),
    Broken(
        "credit_without_record",
        "a pair with no record in common",
        (f"UPDATE credits SET records = 0 WHERE {FIRST_CREDIT}",),
    ),
    Broken(
        "credit_linked",
        "a pair `links` already relates",
        (LONE_LINK, "INSERT INTO credits SELECT src_mbid, dst_mbid, 1 FROM picked"),
    ),
    Broken(
        "official_unsourced",
        "a record the survey shows as not official, published official",
        (
            "UPDATE releases SET official = true WHERE rg_mbid = "
            "(SELECT min(rg_mbid) FROM releases WHERE official = false)",
        ),
    ),
    Broken(
        "artist_styles_mismatch",
        "the line under the name out of order",
        (f"UPDATE artists SET styles = list_reverse(styles) WHERE mbid = '{JOY_DIVISION}'",),
    ),
    Broken(
        "artist_styles_mismatch",
        "the line under the name counting one record too many",
        (
            "UPDATE artists SET styles = list_transform(styles, (s, i) -> CASE WHEN i = 1 "
            "THEN {'style': s.style, 'records': s.records + 1} ELSE s END) "
            f"WHERE mbid = '{JOY_DIVISION}'",
        ),
    ),
    Broken(
        "artist_styles_mismatch",
        "the line under the name missing a style",
        (f"UPDATE artists SET styles = styles[2:] WHERE mbid = '{JOY_DIVISION}'",),
    ),
    Broken(
        "discogs_link_ambiguous",
        # An artist that relates no Discogs page can only carry a style
        # through an id another MBID holds.
        "a style reached through no Discogs page of the artist's own",
        (
            "INSERT INTO styles SELECT (SELECT min(a.mbid) FROM artists a JOIN raw_artists r "
            "USING (mbid) WHERE NOT list_contains([u.type FOR u IN r.urls], 'discogs')), "
            f"decade, style, records FROM styles WHERE artist_mbid = '{JOY_DIVISION}' LIMIT 1",
        ),
    ),
]


@pytest.mark.parametrize(
    "case",
    [pytest.param(c, id=f"{c.invariant}: {c.why}") for c in CASES],
)
def test_a_broken_table_fails_its_invariant(con, case):
    assert violations(con, case.invariant) == 0
    for sql in case.mutation:
        con.execute(sql)
    assert violations(con, case.invariant) == case.rows, case.why


def test_every_view_defined_in_90_invariants_is_registered_in_invariants():
    # Case this must catch: a view added to 90_invariants.sql without also
    # being added to build.INVARIANTS. check_invariants iterates INVARIANTS,
    # not the SQL file, so an unregistered view is created on every build and
    # never queried — it looks like a check and is not one. The campaign
    # crossed this seam three times by hand before this test existed.
    sql = (SQL / "90_invariants.sql").read_text(encoding="utf-8")
    defined_views = set(re.findall(r"CREATE OR REPLACE VIEW (\w+)", sql))
    assert defined_views == set(INVARIANTS)


def test_no_invariant_joins_without_an_equality(con):
    # Case this must catch: an OR or an inequality inside a correlated
    # subquery. The fixtures answer in milliseconds whatever the plan, but on
    # the reference dump a cross product with every raw relation spilled tens
    # of GB without finishing and starved the shared server (2026-10-02). The
    # plan is the same shape on the witnesses, so it is checked here.
    unhashed = ("CROSS_PRODUCT", "NESTED_LOOP_JOIN", "BLOCKWISE_NL_JOIN", "PIECEWISE_MERGE_JOIN")
    offenders = {}
    for name in INVARIANTS:
        plan = con.execute(f"EXPLAIN SELECT count(*) FROM {name}").fetchall()[0][1]
        ops = [op for op in unhashed if op in plan]
        if ops:
            offenders[name] = ops
    assert offenders == {}


def test_build_skips_90_files():
    c = duckdb.connect(":memory:")
    build(c, SQL, FIX / "artists.jsonl", FIX / "release_groups.jsonl")
    with pytest.raises(duckdb.CatalogException):
        c.execute("SELECT * FROM duplicate_artist")


def test_fixtures_satisfy_every_invariant(con):
    assert check_invariants(con, SQL) == []


def test_check_invariants_names_each_broken_invariant_with_its_count(con):
    con.execute("INSERT INTO albums VALUES ('inconnu', 'rg', 'T', 1999, false)")
    con.execute(f"INSERT INTO artists SELECT * FROM artists WHERE mbid = '{BEATLES}'")
    assert check_invariants(con, SQL) == [("duplicate_artist", 1), ("album_without_artist", 1)]


def test_contractual_bounds_are_not_read_from_the_session_variables():
    # Built with dump_year = 2030, the production rules accept Thunder Jolt's
    # declared end in 2027 and Inspiral Carpets' 2027 album. The invariants
    # must not follow the variable: [1850, 2026] is the reference dump's
    # contract, hardcoded in 90_invariants.sql, and moving to another dump is
    # a deliberate edit there — that edit is the point of the check. Reading
    # getvariable('dump_year') back made the views agree with whatever the
    # production rules did.
    c = duckdb.connect(":memory:")
    build(c, SQL, FIX / "artists.jsonl", FIX / "release_groups.jsonl", dump_year=2030)
    assert dict(check_invariants(c, SQL)) == {
        "end_after_dump_year": 1,
        "album_out_of_window": 1,
    }


def test_an_artist_without_a_type_is_expected(con):
    con.execute(f"UPDATE artists SET type = NULL, y0_declared = NULL WHERE mbid = '{BEATLES}'")
    assert violations(con, "artist_unexpected_type") == 0


def test_scalar_reads_the_one_integer_an_aggregate_returns():
    con = duckdb.connect()
    con.execute("CREATE TABLE t AS SELECT * FROM range(3) r(i)")
    assert scalar(con, "SELECT count(*) FROM t") == 3
    assert scalar(con, "SELECT count(*) FROM t WHERE i > 9") == 0


def test_scalar_refuses_a_query_that_returns_no_row():
    # Without the guard, a query that is not an aggregate would read as a
    # TypeError far from its cause.
    con = duckdb.connect()
    con.execute("CREATE TABLE t (i INTEGER)")
    with pytest.raises(AssertionError):
        scalar(con, "SELECT i FROM t")


@pytest.mark.parametrize(
    "fields",
    [
        build_module.RAW_ARTIST_FIELDS,
        build_module.RAW_RG_FIELDS,
        build_module.RAW_POPULARITY_FIELDS,
        build_module.RAW_DISCOGRAPHY_FIELDS,
        build_module.RAW_OFFICIAL_FIELDS,
        build_module.RAW_DISCOGS_FIELDS,
    ],
)
def test_an_absent_input_materializes_the_table_a_read_one_would(tmp_path, fields):
    # A build without a snapshot reads the empty table the SQL expects: if it
    # drifted from what reading the snapshot gives, only real runs would see
    # the other schema.
    con = duckdb.connect()
    path = tmp_path / "input.jsonl"
    path.write_text("{}\n", encoding="utf-8")
    build_module._load_ndjson(con, "read", path, fields)
    build_module._create_empty(con, "empty", fields)
    describe = "SELECT column_name, column_type FROM (DESCRIBE {})"
    assert (
        con.execute(describe.format("read")).fetchall()
        == con.execute(describe.format("empty")).fetchall()
    )


def test_a_discogs_path_with_a_quote_still_reads(tmp_path):
    # The view takes its path as a literal (a view takes no parameter).
    folder = tmp_path / "it's"
    folder.mkdir()
    releases = folder / "releases.jsonl"
    releases.write_text('{"id": 1, "artists": [2], "released": "1999"}\n', encoding="utf-8")
    con = duckdb.connect()
    build_module.load_discogs(con, releases, "20261001")
    assert con.execute("SELECT id, artists FROM raw_discogs").fetchall() == [(1, [2])]
    assert con.execute("SELECT getvariable('discogs_dump')").fetchone() == ("20261001",)


def test_an_absent_popularity_snapshot_sets_its_variable_to_null():
    con = duckdb.connect()
    build_module.load_popularity(con, None, None)
    assert con.execute("SELECT getvariable('popularity_snapshot')").fetchone() == (None,)


def test_the_official_snapshots_are_kept_even_when_no_part_is_read():
    con = duckdb.connect()
    build_module.load_official(con, [], ["2026-10-04", "2026-10-06"])
    (dates,) = con.execute("SELECT getvariable('official_snapshots')").fetchone() or (None,)
    assert [d.isoformat() for d in dates] == ["2026-10-04", "2026-10-06"]
