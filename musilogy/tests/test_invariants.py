import re
from contextlib import contextmanager

import duckdb
import pytest
from conftest import FIX, SQL

from musilogy.build import INVARIANTS, build, check_invariants
from musilogy.paths import SQL_DIR


@contextmanager
def restored(con, *undo):
    """Undo the mutation whatever happens. `con` is module-scoped: without a
    finally, a failing assertion would leave it mutated for every test after
    this one, and the failure would spread instead of staying local."""
    try:
        yield
    finally:
        for sql, params in undo:
            con.execute(sql, params)


def test_every_view_defined_in_90_invariants_is_registered_in_invariants():
    # Case this must catch: a view added to 90_invariants.sql without also
    # being added to build.INVARIANTS. check_invariants iterates INVARIANTS,
    # not the SQL file, so an unregistered view is created on every build and
    # never queried — it looks like a check and is not one. The campaign
    # crossed this seam three times by hand before this test existed.
    sql = (SQL_DIR / "90_invariants.sql").read_text(encoding="utf-8")
    defined_views = set(re.findall(r"CREATE OR REPLACE VIEW (\w+)", sql))
    assert defined_views == set(INVARIANTS)


def test_no_invariant_joins_without_an_equality(con):
    # Case this must catch: an OR or an inequality inside a correlated
    # subquery. The fixtures answer in milliseconds whatever the plan, but on
    # the reference dump a cross product with every raw relation spilled tens
    # of GB without finishing and starved the shared server (2026-10-02). The
    # plan is the same shape on the witnesses, so it is checked here.
    con.execute((SQL / "90_invariants.sql").read_text(encoding="utf-8"))
    unhashed = ("CROSS_PRODUCT", "NESTED_LOOP_JOIN", "BLOCKWISE_NL_JOIN", "PIECEWISE_MERGE_JOIN")
    offenders = {}
    for name in INVARIANTS:
        plan = con.execute(f"EXPLAIN SELECT count(*) FROM {name}").fetchall()[0][1]
        ops = [op for op in unhashed if op in plan]
        if ops:
            offenders[name] = ops
    assert offenders == {}


def test_build_skips_90_files():
    # Dedicated connection, never passed to check_invariants: on `con`
    # (module-scoped, shared by every test in this file), a previous run of
    # 90_invariants.sql would already have created duplicate_artist, and this
    # test would only depend on its rank within the file.
    c = duckdb.connect(":memory:")
    build(c, SQL, FIX / "artists.jsonl", FIX / "release_groups.jsonl", None)
    with pytest.raises(duckdb.CatalogException):
        c.execute("SELECT * FROM duplicate_artist")


def test_fixtures_satisfy_every_invariant(con):
    assert check_invariants(con, SQL) == []


def test_a_broken_invariant_is_reported(con):
    with restored(con, ("DELETE FROM albums WHERE artist_mbid = 'inconnu'", [])):
        con.execute("INSERT INTO albums VALUES ('inconnu', 'rg', 'T', 1999, false)")
        violations = dict(check_invariants(con, SQL))
    assert violations.get("album_without_artist") == 1


def test_album_without_artist_survives_a_null_mbid_in_artists(con):
    # NOT IN used to go silent here: a single NULL mbid in the `artists`
    # subquery makes `x NOT IN (subquery)` never true, whatever x is, so a
    # real violation would go unreported. NOT EXISTS is NULL-safe.
    row = con.execute("SELECT * FROM artists LIMIT 1").fetchone()
    cols = [d[0] for d in con.description]
    values = list(row)
    values[cols.index("mbid")] = None
    placeholders = ", ".join("?" for _ in cols)
    with restored(
        con,
        ("DELETE FROM albums WHERE artist_mbid = 'inconnu-null-poison'", []),
        ("DELETE FROM artists WHERE mbid IS NULL", []),
    ):
        con.execute(
            "INSERT INTO albums VALUES ('inconnu-null-poison', 'rg-null-poison', 'T', 1999, false)"
        )
        con.execute(f"INSERT INTO artists VALUES ({placeholders})", values)
        violations = dict(check_invariants(con, SQL))
    assert violations.get("album_without_artist") == 1


def test_duplicate_artist_is_reported(con):
    row = con.execute("SELECT * FROM artists LIMIT 1").fetchone()
    cols = [d[0] for d in con.description]
    placeholders = ", ".join("?" for _ in cols)
    mbid = row[cols.index("mbid")]
    with restored(
        con,
        (
            "DELETE FROM artists WHERE mbid = ? AND rowid IN "
            "(SELECT rowid FROM artists WHERE mbid = ? LIMIT 1)",
            [mbid, mbid],
        ),
    ):
        con.execute(f"INSERT INTO artists VALUES ({placeholders})", row)
        violations = dict(check_invariants(con, SQL))
    assert violations.get("duplicate_artist") == 1


def test_duplicate_artist_catches_null_mbid(con):
    row = con.execute("SELECT * FROM artists LIMIT 1").fetchone()
    cols = [d[0] for d in con.description]
    values = list(row)
    values[cols.index("mbid")] = None
    placeholders = ", ".join("?" for _ in cols)
    with restored(con, ("DELETE FROM artists WHERE mbid IS NULL", [])):
        con.execute(f"INSERT INTO artists VALUES ({placeholders})", values)
        violations = dict(check_invariants(con, SQL))
    assert violations.get("duplicate_artist") == 1


def test_artist_out_of_window_is_reported(con):
    mbid = con.execute("SELECT mbid FROM artists LIMIT 1").fetchone()[0]
    original = con.execute("SELECT y0 FROM artists WHERE mbid = ?", [mbid]).fetchone()[0]
    with restored(con, ("UPDATE artists SET y0 = ? WHERE mbid = ?", [original, mbid])):
        con.execute("UPDATE artists SET y0 = 1700 WHERE mbid = ?", [mbid])
        violations = dict(check_invariants(con, SQL))
    assert violations.get("artist_out_of_window") == 1


def test_end_before_begin_is_reported(con):
    mbid = con.execute("SELECT mbid FROM artists WHERE y0 IS NOT NULL LIMIT 1").fetchone()[0]
    y0 = con.execute("SELECT y0 FROM artists WHERE mbid = ?", [mbid]).fetchone()[0]
    original = con.execute("SELECT y_end FROM artists WHERE mbid = ?", [mbid]).fetchone()[0]
    with restored(con, ("UPDATE artists SET y_end = ? WHERE mbid = ?", [original, mbid])):
        con.execute("UPDATE artists SET y_end = ? WHERE mbid = ?", [y0 - 1, mbid])
        violations = dict(check_invariants(con, SQL))
    assert violations.get("end_before_begin") == 1


def test_end_after_dump_year_is_reported(con):
    mbid = con.execute("SELECT mbid FROM artists LIMIT 1").fetchone()[0]
    original = con.execute("SELECT y_end_declared FROM artists WHERE mbid = ?", [mbid]).fetchone()[
        0
    ]
    with restored(con, ("UPDATE artists SET y_end_declared = ? WHERE mbid = ?", [original, mbid])):
        con.execute("UPDATE artists SET y_end_declared = 2100 WHERE mbid = ?", [mbid])
        violations = dict(check_invariants(con, SQL))
    assert violations.get("end_after_dump_year") == 1


def test_end_before_min_year_is_reported(con):
    # The end's lower bound, the twin of end_after_dump_year: four artists of
    # the reference dump declare an end in 1537, 1761, 1781 and 1814.
    mbid = con.execute("SELECT mbid FROM artists LIMIT 1").fetchone()[0]
    original = con.execute(
        "SELECT y_end_declared, y_end FROM artists WHERE mbid = ?", [mbid]
    ).fetchone()
    with restored(
        con,
        (
            "UPDATE artists SET y_end_declared = ?, y_end = ? WHERE mbid = ?",
            [*original, mbid],
        ),
    ):
        con.execute("UPDATE artists SET y_end_declared = 1537, y_end = 1537 WHERE mbid = ?", [mbid])
        violations = dict(check_invariants(con, SQL))
    assert violations.get("end_before_min_year") == 1


def test_contractual_bounds_are_not_read_from_the_session_variables():
    # Built with dump_year = 2030, the production rules accept Thunder Jolt's
    # declared end in 2027 and Inspiral Carpets' 2027 album. The invariants
    # must not follow the variable: [1850, 2026] is the reference dump's
    # contract, hardcoded in 90_invariants.sql, and moving to another dump is
    # a deliberate edit there — that edit is the point of the check. Reading
    # getvariable('dump_year') back made the views agree with whatever the
    # production rules did.
    c = duckdb.connect(":memory:")
    build(c, SQL, FIX / "artists.jsonl", FIX / "release_groups.jsonl", None, dump_year=2030)
    assert dict(check_invariants(c, SQL)) == {
        "end_after_dump_year": 1,
        "album_out_of_window": 1,
    }


def test_last_album_mismatch_is_reported(con):
    mbid = con.execute(
        "SELECT mbid FROM artists WHERE y_last_album IS NOT NULL LIMIT 1"
    ).fetchone()[0]
    original = con.execute("SELECT y_last_album FROM artists WHERE mbid = ?", [mbid]).fetchone()[0]
    with restored(con, ("UPDATE artists SET y_last_album = ? WHERE mbid = ?", [original, mbid])):
        con.execute("UPDATE artists SET y_last_album = ? WHERE mbid = ?", [original - 1, mbid])
        violations = dict(check_invariants(con, SQL))
    assert violations.get("last_album_mismatch") == 1


def test_album_out_of_window_is_reported(con):
    rg_mbid = con.execute("SELECT rg_mbid FROM albums LIMIT 1").fetchone()[0]
    original = con.execute("SELECT y FROM albums WHERE rg_mbid = ?", [rg_mbid]).fetchone()[0]
    # 2027: past dump_year (2026) for *any* band, whichever one LIMIT 1
    # returns. 2026 fell within the acceptance window for 133 of the 181
    # fixture artists and only passed by luck of sort order.
    with restored(con, ("UPDATE albums SET y = ? WHERE rg_mbid = ?", [original, rg_mbid])):
        con.execute("UPDATE albums SET y = 2027 WHERE rg_mbid = ?", [rg_mbid])
        violations = dict(check_invariants(con, SQL))
    assert violations.get("album_out_of_window") == 1


def test_album_extra_secondary_type_is_reported(con):
    rg_mbid = con.execute("SELECT rg_mbid FROM albums LIMIT 1").fetchone()[0]
    original = con.execute(
        "SELECT secondary FROM raw_release_groups WHERE mbid = ?", [rg_mbid]
    ).fetchone()[0]
    with restored(
        con,
        ("UPDATE raw_release_groups SET secondary = ? WHERE mbid = ?", [original, rg_mbid]),
    ):
        con.execute("UPDATE raw_release_groups SET secondary = ['Live'] WHERE mbid = ?", [rg_mbid])
        violations = dict(check_invariants(con, SQL))
    assert violations.get("album_extra_secondary_type") == 1


def test_first_album_mismatch_is_reported(con):
    mbid = con.execute(
        "SELECT mbid FROM artists WHERE y_first_album IS NOT NULL LIMIT 1"
    ).fetchone()[0]
    original = con.execute("SELECT y_first_album FROM artists WHERE mbid = ?", [mbid]).fetchone()[0]
    with restored(con, ("UPDATE artists SET y_first_album = ? WHERE mbid = ?", [original, mbid])):
        con.execute("UPDATE artists SET y_first_album = ? WHERE mbid = ?", [original - 1, mbid])
        violations = dict(check_invariants(con, SQL))
    assert violations.get("first_album_mismatch") == 1


def test_y0_source_mismatch_is_reported_when_source_disagrees_with_the_value(con):
    mbid = con.execute("SELECT mbid FROM artists WHERE y0_source = 'declared' LIMIT 1").fetchone()[
        0
    ]
    original = con.execute("SELECT y0 FROM artists WHERE mbid = ?", [mbid]).fetchone()[0]
    with restored(con, ("UPDATE artists SET y0 = ? WHERE mbid = ?", [original, mbid])):
        con.execute("UPDATE artists SET y0 = ? WHERE mbid = ?", [original - 1, mbid])
        violations = dict(check_invariants(con, SQL))
    assert violations.get("y0_source_mismatch") == 1


def test_y0_source_mismatch_is_reported_when_source_is_null_but_y0_is_not(con):
    mbid = con.execute("SELECT mbid FROM artists WHERE y0_source IS NULL LIMIT 1").fetchone()[0]
    with restored(con, ("UPDATE artists SET y0 = NULL, y0_source = NULL WHERE mbid = ?", [mbid])):
        con.execute("UPDATE artists SET y0 = 1999, y0_source = NULL WHERE mbid = ?", [mbid])
        violations = dict(check_invariants(con, SQL))
    assert violations.get("y0_source_mismatch") == 1


def test_y_end_source_mismatch_is_reported(con):
    mbid = con.execute(
        "SELECT mbid FROM artists WHERE y_end_source = 'declared' LIMIT 1"
    ).fetchone()[0]
    original = con.execute("SELECT y_end FROM artists WHERE mbid = ?", [mbid]).fetchone()[0]
    with restored(con, ("UPDATE artists SET y_end = ? WHERE mbid = ?", [original, mbid])):
        con.execute("UPDATE artists SET y_end = ? WHERE mbid = ?", [original - 1, mbid])
        violations = dict(check_invariants(con, SQL))
    assert violations.get("y_end_source_mismatch") == 1


def test_y_end_source_mismatch_catches_a_last_album_label_naming_another_value(con):
    # The shape of the 265 published rows: y_end holds the declared *begin*
    # while y_end_source says 'last_album'. The invariant used to copy the
    # production expression — greatest(y_last_album, coalesce(y0_declared,
    # ...)) — which returns exactly that wrong value, so it stayed empty while
    # its own stated contract was violated. Asserted as a contract
    # ('last_album' => y_end = y_last_album), it fires.
    mbid = con.execute(
        "SELECT mbid FROM artists WHERE y_end_source = 'last_album' LIMIT 1"
    ).fetchone()[0]
    original = con.execute(
        "SELECT y0_declared, y_first_album, y_last_album, y_end FROM artists WHERE mbid = ?", [mbid]
    ).fetchone()
    with restored(
        con,
        (
            "UPDATE artists SET y0_declared = ?, y_first_album = ?, y_last_album = ?, y_end = ? "
            "WHERE mbid = ?",
            [*original, mbid],
        ),
    ):
        con.execute(
            "UPDATE artists SET y0_declared = 2005, y_first_album = NULL, y_last_album = 1959, "
            "y_end = 2005 WHERE mbid = ?",
            [mbid],
        )
        violations = dict(check_invariants(con, SQL))
    assert violations.get("y_end_source_mismatch") == 1


def test_artist_genres_out_of_order_is_reported(con):
    mbid = con.execute(
        "SELECT mbid FROM artists WHERE len(genres) > 1 AND genre_source = 'declared' LIMIT 1"
    ).fetchone()[0]
    original = con.execute("SELECT genres FROM artists WHERE mbid = ?", [mbid]).fetchone()[0]
    restore = "UPDATE artists SET genres = ?, genres_declared = ? WHERE mbid = ?"
    with restored(con, (restore, [original, original, mbid])):
        # Both lists together: reversing `genres` alone is a genre_source_mismatch.
        con.execute(
            "UPDATE artists SET genres = list_reverse(genres), "
            "genres_declared = list_reverse(genres_declared) WHERE mbid = ?",
            [mbid],
        )
        reversed_genres = con.execute(
            "SELECT genres FROM artists WHERE mbid = ?", [mbid]
        ).fetchone()[0]
        violations = dict(check_invariants(con, SQL))
    assume_effective = reversed_genres != original
    assert assume_effective
    assert violations.get("artist_genres_out_of_order") == 1


def test_a_source_that_does_not_name_the_list_genres_came_from_is_reported(con):
    # Joy Division declares genres, so `genres` is its declared list; calling
    # that list `albums` is the mislabel genre_source exists to prevent.
    joy_division = "9a58fda3-f4ed-4080-a3a5-f457aac9fcdd"
    with restored(
        con, ("UPDATE artists SET genre_source = 'declared' WHERE mbid = ?", [joy_division])
    ):
        con.execute("UPDATE artists SET genre_source = 'albums' WHERE mbid = ?", [joy_division])
        violations = dict(check_invariants(con, SQL))
    assert violations.get("genre_source_mismatch") == 1


def test_album_genres_that_disagree_with_the_albums_are_reported(con):
    # The Belle Stars' genres come from its albums; one vote more on the first
    # of them is a sum the release-groups do not add up to.
    belle_stars = "62f7a211-0056-45fe-934a-37a388a7356f"
    original = con.execute(
        "SELECT genres_from_albums FROM artists WHERE mbid = ?", [belle_stars]
    ).fetchone()[0]
    restore = "UPDATE artists SET genres_from_albums = ?, genres = ? WHERE mbid = ?"
    with restored(con, (restore, [original, original, belle_stars])):
        con.execute(
            "UPDATE artists SET genres_from_albums = list_transform(genres_from_albums, "
            "(g, i) -> CASE WHEN i = 1 THEN {'mbid': g.mbid, 'name': g.name, 'votes': g.votes + 1} "
            "ELSE g END) WHERE mbid = ?",
            [belle_stars],
        )
        con.execute("UPDATE artists SET genres = genres_from_albums WHERE mbid = ?", [belle_stars])
        violations = dict(check_invariants(con, SQL))
    assert violations.get("genres_from_albums_mismatch") == 1


def test_unknown_genre_is_reported(con):
    mbid = con.execute("SELECT mbid FROM artists LIMIT 1").fetchone()[0]
    original = con.execute("SELECT genres FROM artists WHERE mbid = ?", [mbid]).fetchone()[0]
    with restored(con, ("UPDATE artists SET genres = ? WHERE mbid = ?", [original, mbid])):
        con.execute(
            "UPDATE artists SET genres = list_append(genres, "
            "{'mbid': 'inconnu', 'name': 'x', 'votes': 1}) WHERE mbid = ?",
            [mbid],
        )
        violations = dict(check_invariants(con, SQL))
    assert violations.get("unknown_genre") == 1


def test_unknown_genre_survives_a_null_genre_mbid_in_the_vocabulary(con):
    # Same NULL trap as album_without_artist: a NULL genre_mbid in the
    # `genres` subquery used to make NOT IN never true. Demonstrated in
    # review on this exact invariant.
    mbid = con.execute("SELECT mbid FROM artists LIMIT 1").fetchone()[0]
    original = con.execute("SELECT genres FROM artists WHERE mbid = ?", [mbid]).fetchone()[0]
    with restored(
        con,
        ("UPDATE artists SET genres = ? WHERE mbid = ?", [original, mbid]),
        ("DELETE FROM genres WHERE genre_mbid IS NULL", []),
    ):
        con.execute(
            "UPDATE artists SET genres = list_append(genres, "
            "{'mbid': 'inconnu-null-poison', 'name': 'x', 'votes': 1}) WHERE mbid = ?",
            [mbid],
        )
        # Named columns, not positional: this row exists to poison genre_mbid
        # with a NULL, and it must not have to be rewritten every time the
        # vocabulary gains a column it says nothing about.
        con.execute(
            "INSERT INTO genres (genre_mbid, name, n_artists) VALUES (NULL, 'null-poison', 0)"
        )
        violations = dict(check_invariants(con, SQL))
    assert violations.get("unknown_genre") == 1


def test_genre_n_artists_mismatch_is_reported(con):
    genre_mbid = con.execute("SELECT genre_mbid FROM genres LIMIT 1").fetchone()[0]
    original = con.execute(
        "SELECT n_artists FROM genres WHERE genre_mbid = ?", [genre_mbid]
    ).fetchone()[0]
    with restored(
        con, ("UPDATE genres SET n_artists = ? WHERE genre_mbid = ?", [original, genre_mbid])
    ):
        con.execute(
            "UPDATE genres SET n_artists = ? WHERE genre_mbid = ?", [original + 1, genre_mbid]
        )
        violations = dict(check_invariants(con, SQL))
    assert violations.get("genre_n_artists_mismatch") == 1


def test_link_endpoint_missing_is_reported(con):
    artist = con.execute("SELECT mbid FROM artists LIMIT 1").fetchone()[0]
    with restored(con, ("DELETE FROM links WHERE dst_mbid = 'inconnu'", [])):
        con.execute("INSERT INTO links VALUES (?, 'inconnu', 'tribute', NULL, NULL)", [artist])
        violations = dict(check_invariants(con, SQL))
    assert violations.get("link_endpoint_missing") == 1


def test_link_endpoint_missing_survives_a_null_mbid_in_artists(con):
    # Same NULL trap as album_without_artist: a single NULL mbid in the `artists`
    # subquery makes `x NOT IN (subquery)` never true, whatever x is, so the
    # invariant would go silent on every real violation. NOT EXISTS is NULL-safe.
    row = con.execute("SELECT * FROM artists LIMIT 1").fetchone()
    cols = [d[0] for d in con.description]
    values = list(row)
    values[cols.index("mbid")] = None
    placeholders = ", ".join("?" for _ in cols)
    with restored(
        con,
        ("DELETE FROM links WHERE dst_mbid = 'inconnu-null-poison'", []),
        ("DELETE FROM artists WHERE mbid IS NULL", []),
    ):
        con.execute(
            "INSERT INTO links VALUES (?, 'inconnu-null-poison', 'tribute', NULL, NULL)", [row[0]]
        )
        con.execute(f"INSERT INTO artists VALUES ({placeholders})", values)
        violations = dict(check_invariants(con, SQL))
    assert violations.get("link_endpoint_missing") == 1


def test_link_incomplete_is_reported(con):
    artist = con.execute("SELECT mbid FROM artists LIMIT 1").fetchone()[0]
    with restored(con, ("DELETE FROM links WHERE type IS NULL", [])):
        con.execute("INSERT INTO links VALUES (?, ?, NULL, 1999, NULL)", [artist, artist])
        violations = dict(check_invariants(con, SQL))
    assert violations.get("link_incomplete") == 1


def test_duplicate_link_is_reported(con):
    # NULL years on purpose: a duplicate must be caught on the triple alone,
    # and GROUP BY has to treat two NULL edges as the same relation, exactly
    # as the DISTINCT of 80_links.sql collapses them.
    src, dst = con.execute("SELECT src_mbid, dst_mbid FROM links LIMIT 1").fetchone()
    with restored(con, ("DELETE FROM links WHERE type = 'duplicate'", [])):
        for _ in range(2):
            con.execute("INSERT INTO links VALUES (?, ?, 'duplicate', NULL, NULL)", [src, dst])
        violations = dict(check_invariants(con, SQL))
    assert violations.get("duplicate_link") == 1


def test_link_misoriented_catches_a_reversed_link(con):
    # A link swapped end for end keeps both ends among the artists and stays
    # unique: only the orientation check can tell.
    # One row for its triple and no reverse already published, so that the
    # undo below restores exactly what was there.
    row = con.execute(
        "SELECT * FROM links l WHERE src_mbid <> dst_mbid AND NOT EXISTS ("
        "  SELECT 1 FROM links r WHERE r.src_mbid = l.dst_mbid AND r.dst_mbid = l.src_mbid"
        "    AND r.type = l.type)"
        " QUALIFY count(*) OVER (PARTITION BY src_mbid, dst_mbid, type) = 1 LIMIT 1"
    ).fetchone()
    src, dst, kind, y_begin, y_end = row
    with restored(
        con,
        ("DELETE FROM links WHERE src_mbid = ? AND dst_mbid = ? AND type = ?", [dst, src, kind]),
        ("INSERT INTO links VALUES (?, ?, ?, ?, ?)", list(row)),
    ):
        con.execute(
            "DELETE FROM links WHERE src_mbid = ? AND dst_mbid = ? AND type = ?", [src, dst, kind]
        )
        con.execute("INSERT INTO links VALUES (?, ?, ?, ?, ?)", [dst, src, kind, y_begin, y_end])
        violations = dict(check_invariants(con, SQL))
    assert violations.get("link_misoriented")


def test_corrections_file_too_large_is_reported(con):
    with restored(con, ("DELETE FROM corrections", [])):
        con.execute(
            "INSERT INTO corrections SELECT 'm' || i, 'begin', '2000', 'j', 's' "
            "FROM range(51) AS t(i)"
        )
        violations = dict(check_invariants(con, SQL))
    assert violations.get("corrections_file_too_large") == 1


def test_corrections_invalid_is_reported(con):
    # Three real silent no-ops: an unknown mbid, a misspelled field (typo),
    # and a field unsupported by apply_corrections.
    mbid = con.execute("SELECT mbid FROM artists LIMIT 1").fetchone()[0]
    with restored(
        con,
        (
            "DELETE FROM corrections WHERE mbid = 'inconnu' OR field IN ('Begin', 'country')",
            [],
        ),
    ):
        con.execute(
            "INSERT INTO corrections VALUES "
            "('inconnu', 'begin', '2000', 'j', 's'), "
            f"('{mbid}', 'Begin', '2000', 'j', 's'), "
            f"('{mbid}', 'country', 'FR', 'j', 's')"
        )
        violations = dict(check_invariants(con, SQL))
    assert violations.get("corrections_invalid") == 3


def test_birth_misread_is_reported_on_both_sides(con):
    # A person's begin must land in y_birth only, and no other type may carry
    # one: each half of a swapped CASE in 10_bands.sql is caught.
    person = con.execute("SELECT mbid FROM artists WHERE type = 'Person' LIMIT 1").fetchone()[0]
    with restored(con, ("UPDATE artists SET y0_declared = NULL WHERE mbid = ?", [person])):
        con.execute("UPDATE artists SET y0_declared = 1990 WHERE mbid = ?", [person])
        assert dict(check_invariants(con, SQL)).get("birth_misread") == 1
    group = con.execute("SELECT mbid FROM artists WHERE type = 'Group' LIMIT 1").fetchone()[0]
    with restored(con, ("UPDATE artists SET y_birth = NULL WHERE mbid = ?", [group])):
        con.execute("UPDATE artists SET y_birth = 1960 WHERE mbid = ?", [group])
        assert dict(check_invariants(con, SQL)).get("birth_misread") == 1


def test_birth_misread_catches_a_birth_that_never_reached_y_birth(con):
    # The other failure of the same CASE: a readable birth dropped on the way.
    person = con.execute(
        "SELECT mbid FROM artists WHERE type = 'Person' AND y_birth IS NOT NULL LIMIT 1"
    ).fetchone()[0]
    birth = con.execute("SELECT y_birth FROM artists WHERE mbid = ?", [person]).fetchone()[0]
    with restored(con, ("UPDATE artists SET y_birth = ? WHERE mbid = ?", [birth, person])):
        con.execute("UPDATE artists SET y_birth = NULL WHERE mbid = ?", [person])
        assert dict(check_invariants(con, SQL)).get("birth_misread") == 1


def test_artist_unexpected_type_is_reported(con):
    # extract.py keeps {Group, Orchestra, Choir, Person} and nothing else
    # states that contract: a change to KEPT_TYPES would move the population
    # in silence.
    mbid = con.execute("SELECT mbid FROM artists LIMIT 1").fetchone()[0]
    original = con.execute("SELECT type FROM artists WHERE mbid = ?", [mbid]).fetchone()[0]
    with restored(con, ("UPDATE artists SET type = ? WHERE mbid = ?", [original, mbid])):
        con.execute("UPDATE artists SET type = 'Character' WHERE mbid = ?", [mbid])
        violations = dict(check_invariants(con, SQL))
    assert violations.get("artist_unexpected_type") == 1


def test_artist_unexpected_type_catches_a_null_type(con):
    mbid = con.execute("SELECT mbid FROM artists LIMIT 1").fetchone()[0]
    original = con.execute("SELECT type FROM artists WHERE mbid = ?", [mbid]).fetchone()[0]
    with restored(con, ("UPDATE artists SET type = ? WHERE mbid = ?", [original, mbid])):
        con.execute("UPDATE artists SET type = NULL WHERE mbid = ?", [mbid])
        violations = dict(check_invariants(con, SQL))
    assert violations.get("artist_unexpected_type") == 1


def test_corrections_duplicate_is_reported(con):
    mbid = con.execute("SELECT mbid FROM artists LIMIT 1").fetchone()[0]
    with restored(con, ("DELETE FROM corrections WHERE justification = 'dup'", [])):
        con.execute(
            "INSERT INTO corrections VALUES (?, 'begin', '2000', 'dup', 's'), "
            "(?, 'begin', '1999', 'dup', 's')",
            [mbid, mbid],
        )
        violations = dict(check_invariants(con, SQL))
    assert violations.get("corrections_duplicate") == 1


def test_corrections_invalid_survives_a_null_mbid_in_raw_artists(con):
    # Same NULL trap as album_without_artist and unknown_genre: a NULL mbid
    # in the `raw_artists` subquery used to make NOT IN never true.
    with restored(
        con,
        ("DELETE FROM raw_artists WHERE mbid IS NULL", []),
        ("DELETE FROM corrections WHERE mbid = 'inconnu-null-poison'", []),
    ):
        con.execute("INSERT INTO raw_artists (mbid) VALUES (NULL)")
        con.execute(
            "INSERT INTO corrections VALUES ('inconnu-null-poison', 'begin', '2000', 'j', 's')"
        )
        violations = dict(check_invariants(con, SQL))
    assert violations.get("corrections_invalid") == 1
