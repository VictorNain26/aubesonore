"""Our co-listening on synthetic listens: a handful of users whose shared
artists make every rule of colisten.py visible."""

import duckdb
import numpy as np
import pytest
from conftest import listening_file

from musilogy import colisten
from musilogy.build import load_listening
from musilogy.colisten import build_colisten, scores

A = "a0000000-0000-0000-0000-000000000000"
B = "b0000000-0000-0000-0000-000000000000"
C = "c0000000-0000-0000-0000-000000000000"
X = "f0000000-0000-0000-0000-000000000000"
SOLO = "e0000000-0000-0000-0000-000000000000"
USERS = {
    1: [A, B, C],
    2: [A, B, C],
    3: [A, B, SOLO],
    4: [A, C],
    5: [B, C, X],
    6: [A, B],
    7: [X],
    8: [X],
}


def built(tmp_path):
    c = duckdb.connect(":memory:")
    load_listening(c, listening_file(tmp_path / "listens", USERS), "test")
    build_colisten(c)
    return c


@pytest.fixture
def con(tmp_path):
    return built(tmp_path)


def neighbours(con, artist):
    return con.execute(
        "SELECT neighbour_mbid, common, rank FROM colisten WHERE artist_mbid = ? ORDER BY rank",
        [artist],
    ).fetchall()


def test_the_rule_ranks_the_most_shared_first(con):
    # A: 5 listeners, B: 5, C: 4; A and B share 4, A and C share 3.
    assert neighbours(con, A) == [(B, 4, 1), (C, 3, 2)]
    score = con.execute(
        "SELECT score FROM colisten WHERE artist_mbid = ? AND neighbour_mbid = ?", [A, B]
    ).fetchone()
    assert score is not None
    assert score[0] == pytest.approx(4 / (5**0.3 * 5**0.7) * 4 / (4 + 10))


def test_a_tie_falls_to_the_neighbours_mbid(con):
    # C shares 3 listeners with A and with B, both 5 listeners strong.
    assert neighbours(con, C) == [(A, 3, 1), (B, 3, 2)]


def test_too_few_listeners_or_in_common_make_no_pair(con):
    # SOLO has one listener; X has three but shares only one with B and C.
    known = con.execute("SELECT artist_mbid::VARCHAR FROM colisten_artists").fetchall()
    artists = {a for (a,) in known}
    assert artists == {A, B, C, X}
    assert neighbours(con, X) == []
    assert all(n != X for n, _, _ in neighbours(con, B))


def test_never_the_artist_itself(con):
    self_pairs = con.execute("SELECT count(*) FROM colisten WHERE artist_mbid = neighbour_mbid")
    assert self_pairs.fetchone() == (0,)


def test_only_the_top_k_are_kept(tmp_path, monkeypatch):
    monkeypatch.setattr(colisten, "K", 1)
    assert neighbours(built(tmp_path), A) == [(B, 4, 1)]


def test_no_listens_give_an_empty_table():
    c = duckdb.connect(":memory:")
    load_listening(c, None, None)
    build_colisten(c)
    assert c.execute("SELECT count(*) FROM colisten").fetchone() == (0,)


def test_the_rule_shrinks_a_thin_overlap():
    # The same proportions, ten times fewer listeners: the shrinkage more than halves it.
    thin = scores(np.array([2.0]), 4, np.array([4.0]))
    thick = scores(np.array([20.0]), 40, np.array([40.0]))
    assert thin[0] < thick[0] / 2
