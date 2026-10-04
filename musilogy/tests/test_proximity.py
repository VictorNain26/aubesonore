import json

from conftest import FIX, SQL, build_synthetic, proximity_file, synthetic_artist
from test_invariants import restored

from musilogy.build import check_invariants

A = "00000000-0000-4000-8000-0000000000e1"
B = "00000000-0000-4000-8000-0000000000e2"
C = "00000000-0000-4000-8000-0000000000e3"
ELSEWHERE = "00000000-0000-4000-8000-0000000000e9"
# Line 119 of the snapshot: 3ab9740e… is this artist's neighbour at ranks 10
# and 11, with the same score.
REPEATER = "003ecf7a-01f6-4dda-a041-e71366e70c42"
REPEATED = "3ab9740e-8983-4d5c-9c63-1b13124b610c"


def snapshot_lines():
    with (FIX / "proximity.jsonl").open(encoding="utf-8") as fh:
        return [json.loads(line) for line in fh]


def neighbours(con, artist):
    return con.execute(
        "SELECT neighbour_mbid, score, rank FROM proximity WHERE artist_mbid = ? ORDER BY rank",
        [artist],
    ).fetchall()


def test_the_rank_is_the_place_in_the_service_answer(con):
    # Transcribed from the snapshot itself: an artist with 100 neighbours
    # keeps them all, in order, ranked from 1.
    line = next(r for r in snapshot_lines() if len(r["similar"]) == 100)
    assert neighbours(con, line["artist_mbid"]) == [
        (n["artist_mbid"], n["score"], i) for i, n in enumerate(line["similar"], start=1)
    ]


def test_a_repeated_neighbour_keeps_its_best_occurrence(con):
    # Rank 10 is kept, rank 11 left free, not filled by renumbering.
    rows = neighbours(con, REPEATER)
    assert [rank for m, _, rank in rows if m == REPEATED] == [10]
    assert 11 not in {rank for _, _, rank in rows}
    assert con.execute("SELECT * FROM proximity_exclusions").fetchone() == (1,)


def test_the_best_occurrence_is_the_smallest_rank_whatever_the_order_of_the_file(tmp_path):
    c = build_synthetic(
        tmp_path,
        [synthetic_artist(A, "1970", None)],
        proximity=proximity_file(tmp_path / "p.jsonl", {A: [(B, 50), (C, 40), (B, 30)]}),
    )
    assert neighbours(c, A) == [(B, 50, 1), (C, 40, 2)]
    assert check_invariants(c, SQL) == []


def test_a_neighbour_absent_from_the_dump_stays_in_the_table(tmp_path):
    c = build_synthetic(
        tmp_path,
        [synthetic_artist(A, "1970", None)],
        proximity=proximity_file(tmp_path / "p.jsonl", {A: [(ELSEWHERE, 50)]}),
    )
    assert neighbours(c, A) == [(ELSEWHERE, 50, 1)]


def surveyed(con):
    return dict(con.execute("SELECT mbid, proximity_surveyed FROM artists").fetchall())


def test_an_artist_asked_is_surveyed_even_without_a_neighbour(tmp_path):
    # A was asked and has none, B was asked and has one, C was never asked:
    # only C is unsurveyed, and its empty list is no answer.
    artists = [synthetic_artist(m, "1970", None) for m in (A, B, C)]
    snapshot = proximity_file(tmp_path / "p.jsonl", {A: [], B: [(A, 50)]})
    c = build_synthetic(tmp_path, artists, proximity=snapshot)
    assert surveyed(c) == {A: True, B: True, C: False}


def test_no_artist_is_surveyed_or_unsurveyed_without_a_snapshot(tmp_path):
    c = build_synthetic(tmp_path, [synthetic_artist(A, "1970", None)])
    assert surveyed(c) == {A: None}


def test_proximity_rank_out_of_range_is_reported(con):
    artist, neighbour, rank = con.execute(
        "SELECT artist_mbid, neighbour_mbid, rank FROM proximity LIMIT 1"
    ).fetchone()
    undo = "UPDATE proximity SET rank = ? WHERE artist_mbid = ? AND neighbour_mbid = ?"
    with restored(con, (undo, [rank, artist, neighbour])):
        con.execute(undo, [101, artist, neighbour])
        violations = dict(check_invariants(con, SQL))
    assert violations.get("proximity_rank_out_of_range") == 1


def test_proximity_malformed_is_reported(con):
    artist, neighbour = con.execute(
        "SELECT artist_mbid, neighbour_mbid FROM proximity LIMIT 1"
    ).fetchone()
    undo = "UPDATE proximity SET neighbour_mbid = ? WHERE artist_mbid = ? AND neighbour_mbid = ?"
    with restored(con, (undo, [neighbour, artist, neighbour.upper()])):
        con.execute(undo, [neighbour.upper(), artist, neighbour])
        violations = dict(check_invariants(con, SQL))
    assert violations.get("proximity_malformed") == 1


def test_duplicate_proximity_is_reported(con):
    row = con.execute("SELECT * FROM proximity LIMIT 1").fetchone()
    undo = "DELETE FROM proximity WHERE artist_mbid = ? AND neighbour_mbid = ?"
    with restored(con, (undo, list(row[:2])), ("INSERT INTO proximity VALUES (?, ?, ?, ?)", row)):
        con.execute("INSERT INTO proximity VALUES (?, ?, ?, ?)", row)
        violations = dict(check_invariants(con, SQL))
    assert violations.get("duplicate_proximity") == 1


def test_proximity_unsourced_catches_the_repeat_kept_at_its_worse_rank(con):
    # The other occurrence of the repeat is in the snapshot, but it is not the
    # best one: keeping it is the rule applied backwards.
    undo = "UPDATE proximity SET rank = ? WHERE artist_mbid = ? AND neighbour_mbid = ?"
    with restored(con, (undo, [10, REPEATER, REPEATED])):
        con.execute(undo, [11, REPEATER, REPEATED])
        violations = dict(check_invariants(con, SQL))
    assert violations.get("proximity_unsourced") == 1
