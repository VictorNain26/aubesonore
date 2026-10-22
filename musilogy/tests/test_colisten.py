"""Our co-listening on synthetic listens: a handful of users whose shared
artists make every rule of colisten.py visible."""

import duckdb
import numpy as np
import pytest

from musilogy import colisten
from musilogy.build import colisten_from, load_listening
from musilogy.colisten import build_colisten, cache_key, scores
from tests.conftest import listening_file

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


def test_a_tie_at_the_last_place_kept_falls_to_the_mbid(tmp_path, monkeypatch):
    # Twelve artists each listened to by the same three users as REF, so all
    # tie: the three kept are the first three by MBID, whatever order the
    # product gives them in.
    ref = "00000000-0000-4000-8000-000000000000"
    tied = [f"00000000-0000-4000-8000-0000000000{i:02x}" for i in range(1, 13)]
    monkeypatch.setattr(colisten, "K", 3)
    c = duckdb.connect(":memory:")
    users = {u: [ref, *tied] for u in range(1, 4)}
    load_listening(c, listening_file(tmp_path / "listens", users), "test")
    build_colisten(c)
    assert [n for n, _, _ in neighbours(c, ref)] == tied[:3]


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


def from_cache(tmp_path, users, cache):
    c = duckdb.connect(":memory:")
    listens = listening_file(tmp_path / f"listens-{len(users)}", users)
    colisten_from(c, listens, "test", cache)
    return c


def rows(con):
    return con.execute("SELECT * FROM colisten ORDER BY artist_mbid, rank").fetchall()


def test_a_computed_colisten_is_kept_and_read_back_as_computed(tmp_path):
    cache = tmp_path / "work" / "colisten.parquet"
    computed = from_cache(tmp_path, USERS, cache)
    assert cache.exists()
    # Other listens: what is read is the cache, not a computation.
    read = from_cache(tmp_path, {1: [A, B]}, cache)
    assert rows(read) == rows(computed)
    assert (
        read.execute("DESCRIBE colisten").fetchall()
        == computed.execute("DESCRIBE colisten").fetchall()
    )
    # The manifest and the invariants read the rule's parameters either way.
    assert read.execute("SELECT getvariable('colisten_k')").fetchone() == (colisten.K,)


def test_without_listens_nothing_is_kept(tmp_path):
    cache = tmp_path / "colisten.parquet"
    c = duckdb.connect(":memory:")
    colisten_from(c, None, None, cache)
    assert rows(c) == []
    assert not cache.exists()


def test_without_a_cache_the_colisten_is_computed(tmp_path):
    c = duckdb.connect(":memory:")
    colisten_from(c, listening_file(tmp_path / "listens", USERS), "test", None)
    assert neighbours(c, A) == [(B, 4, 1), (C, 3, 2)]


def test_the_cache_key_follows_the_parameters(monkeypatch):
    key = cache_key()
    assert cache_key() == key
    monkeypatch.setitem(colisten.PARAMETERS, "colisten_k", 49)
    assert cache_key() != key


def test_the_cache_key_follows_the_computation(monkeypatch):
    # A change to the rule that keeps its parameters must not read a
    # co-listening computed by the previous rule.
    key = cache_key()
    monkeypatch.setattr(colisten, "SOURCE", colisten.SOURCE + b"CHUNK = 7\n")
    assert cache_key() != key


def test_the_cache_key_ignores_comments_and_docstrings(monkeypatch):
    # Ten hours of computation are not redone for a word in a comment.
    key = cache_key()
    commented = colisten.SOURCE.replace(b'"""Our co-listening', b'"""Another word on our co-listening')
    monkeypatch.setattr(colisten, "SOURCE", commented + b"# a remark\n")
    assert cache_key() == key


def test_without_listens_a_kept_colisten_is_not_read(tmp_path):
    # A build without listens publishes no listening source: it must not
    # publish a co-listening either.
    cache = tmp_path / "colisten.parquet"
    from_cache(tmp_path, USERS, cache)
    c = duckdb.connect(":memory:")
    colisten_from(c, None, None, cache)
    assert rows(c) == []


def test_a_kept_colisten_is_read_from_its_file_not_held_in_memory(tmp_path):
    # Millions of rows held in the build's capped memory push later steps to
    # spill: once kept, the table is the file, computed or read back.
    cache = tmp_path / "colisten.parquet"
    for users in (USERS, {1: [A, B]}):
        c = from_cache(tmp_path, users, cache)
        views = c.execute("SELECT view_name FROM duckdb_views() WHERE NOT internal").fetchall()
        assert views == [("colisten",)]
