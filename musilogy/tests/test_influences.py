from conftest import SQL, build_synthetic, influences_file, synthetic_artist
from test_invariants import restored

from musilogy import REFERENCE_INFLUENCES
from musilogy.build import check_invariants

U2 = "a3cb23fc-acd3-4ce0-8f36-1e5aa6a18432"
JOY_DIVISION = "9a58fda3-f4ed-4080-a3a5-f457aac9fcdd"
A = "00000000-0000-4000-8000-0000000000d1"
B = "00000000-0000-4000-8000-0000000000d2"


def build_with(tmp_path, rows):
    return build_synthetic(
        tmp_path,
        [synthetic_artist(A, "1970", None), synthetic_artist(B, "1960", None)],
        influences=influences_file(tmp_path / "influences.jsonl", rows),
        influences_snapshot=REFERENCE_INFLUENCES,
    )


def test_a_witness_cites_its_influence_with_the_statement_that_says_so(con):
    # Transcribed from the snapshot: U2 (Q396) cites Joy Division. Read the
    # other way round, Joy Division would cite U2.
    assert con.execute(
        "SELECT statement FROM influences WHERE artist_mbid = ? AND influence_mbid = ?",
        [U2, JOY_DIVISION],
    ).fetchall() == [("Q396$f3eaf34b-4149-e380-038a-5141879aadff",)]
    assert con.execute(
        "SELECT count(*) FROM influences WHERE artist_mbid = ? AND influence_mbid = ?",
        [JOY_DIVISION, U2],
    ).fetchone() == (0,)


def test_two_declarations_of_one_pair_are_one_row_citing_the_smallest(tmp_path):
    # Two Wikidata items sharing an MBID, or one item stating it twice: the
    # pair is one influence, cited by one statement, whichever order the
    # snapshot holds them in.
    c = build_with(tmp_path, [(A, B, "Q2$b"), (A, B, "Q1$a")])
    assert c.execute("SELECT * FROM influences").fetchall() == [(A, B, "Q1$a")]
    assert check_invariants(c, SQL) == []


def test_an_end_absent_from_the_dump_stays_in_the_table(tmp_path):
    # The functions the site reads leave it out, for want of a name; the
    # table keeps what Wikidata declares.
    elsewhere = "00000000-0000-4000-8000-0000000000d9"
    c = build_with(tmp_path, [(A, elsewhere, "Q1$a")])
    assert c.execute("SELECT influence_mbid FROM influences").fetchall() == [(elsewhere,)]
    assert check_invariants(c, SQL) == []


def test_duplicate_influence_is_reported(con):
    row = con.execute("SELECT * FROM influences LIMIT 1").fetchone()
    undo = "DELETE FROM influences WHERE artist_mbid = ? AND influence_mbid = ?"
    with restored(con, (undo, list(row[:2])), ("INSERT INTO influences VALUES (?, ?, ?)", row)):
        con.execute("INSERT INTO influences VALUES (?, ?, ?)", row)
        violations = dict(check_invariants(con, SQL))
    assert violations.get("duplicate_influence") == 1


def test_influence_malformed_is_reported(tmp_path):
    # An uppercase MBID joins no artist; a statement without its item cannot
    # be cited. Each is one malformed row.
    c = build_with(tmp_path, [(A.upper(), B, "Q1$a"), (A, B, "a")])
    assert dict(check_invariants(c, SQL)).get("influence_malformed") == 2


def test_influence_unsourced_catches_a_reversed_row(con):
    artist, influence, statement = con.execute(
        "SELECT * FROM influences WHERE artist_mbid = ? AND influence_mbid = ?", [U2, JOY_DIVISION]
    ).fetchone()
    with restored(
        con,
        (
            "DELETE FROM influences WHERE artist_mbid = ? AND influence_mbid = ?",
            [influence, artist],
        ),
        ("INSERT INTO influences VALUES (?, ?, ?)", [artist, influence, statement]),
    ):
        con.execute(
            "UPDATE influences SET artist_mbid = ?, influence_mbid = ? "
            "WHERE artist_mbid = ? AND influence_mbid = ?",
            [influence, artist, artist, influence],
        )
        violations = dict(check_invariants(con, SQL))
    assert violations.get("influence_unsourced") == 1
