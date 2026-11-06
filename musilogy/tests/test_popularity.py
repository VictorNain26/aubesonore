import json

from musilogy import REFERENCE_POPULARITY
from tests.conftest import FIX, build_synthetic, synthetic_artist

BEATLES = "b10bbbfc-cf9e-42e0-be17-e2c3e1d2600d"


def raw_rows():
    with (FIX / "popularity.jsonl").open(encoding="utf-8") as fh:
        return {r["artist_mbid"]: r for r in map(json.loads, fh)}


def test_every_known_count_is_published_under_its_own_name(con):
    # Breaks if the two counts are swapped or a known artist is dropped.
    raw = raw_rows()
    published = {
        mbid: (listen, users, str(snapshot))
        for mbid, listen, users, snapshot in con.execute("SELECT * FROM popularity").fetchall()
    }
    assert published == {
        m: (r["total_listen_count"], r["total_user_count"], REFERENCE_POPULARITY)
        for m, r in raw.items()
        if r["total_listen_count"] is not None
    }
    assert BEATLES in published


def test_an_artist_listenbrainz_does_not_know_keeps_no_row(con):
    # Null is "no listen recorded", not zero: published as zero, it would sit
    # among the least popular instead of out of the ranking.
    unknown = [m for m, r in raw_rows().items() if r["total_listen_count"] is None]
    assert unknown
    rows = con.execute(
        "SELECT count(*) FROM popularity WHERE list_contains(?, mbid)", [unknown]
    ).fetchone()
    assert rows == (0,)


def test_a_build_without_a_snapshot_keeps_its_snapshot_column_a_date(tmp_path):
    # The site's musilogy.popularity.snapshot is a date: an absent snapshot,
    # read as an untyped NULL, would turn the published column into an INTEGER.
    c = build_synthetic(tmp_path, [synthetic_artist(BEATLES, "1960", "1970")])
    types = dict(c.execute("SELECT column_name, column_type FROM (DESCRIBE popularity)").fetchall())
    assert types["snapshot"] == "DATE"
