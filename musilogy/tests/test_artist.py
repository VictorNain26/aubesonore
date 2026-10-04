import json

from conftest import loaded, pg_query, synthetic_artist

A = "00000000-0000-4000-8000-0000000000f1"
B = "00000000-0000-4000-8000-0000000000f2"


def genre(name):
    return {"mbid": f"g-{name}", "name": name, "votes": 1}


def group(mbid, begin="1978", end="1985", genres=("post-punk",), relations=None):
    return synthetic_artist(
        mbid, begin, end, genres=[genre(g) for g in genres], relations=relations
    )


def relation(kind, target):
    return {"type": kind, "direction": "forward", "mbid": target, "begin": None, "end": None}


def test_an_artist_unknown_to_listenbrainz_has_no_count_rather_than_zero(tmp_path, pg):
    loaded(tmp_path, pg, [group(A), group(B)], popularity={A: 42})
    cards = {
        r[0]: r
        for r in pg_query(
            pg,
            "SELECT mbid, listen_count, genres FROM musilogy.artist_card"
            f"('{A}') UNION ALL SELECT mbid, listen_count, genres FROM musilogy.artist_card('{B}')",
        )
    }
    assert cards[A][1] == 42
    assert cards[B][1] is None
    assert [g["name"] for g in json.loads(cards[A][2])] == ["post-punk"]


def test_a_link_reads_forward_from_its_source_and_backward_from_its_target(tmp_path, pg):
    loaded(tmp_path, pg, [group(A, relations=[relation("member of band", B)]), group(B)])
    assert pg_query(
        pg, f"SELECT type, direction, other_mbid FROM musilogy.artist_links('{A}')"
    ) == [("member of band", "forward", B)]
    assert pg_query(
        pg, f"SELECT type, direction, other_mbid FROM musilogy.artist_links('{B}')"
    ) == [("member of band", "backward", A)]


C = "00000000-0000-4000-8000-0000000000f3"
ABSENT = "00000000-0000-4000-8000-0000000000f9"


def influences(conninfo, mbid):
    return pg_query(
        conninfo,
        f"SELECT direction, mbid, y0, statement FROM musilogy.artist_influences('{mbid}')",
    )


def test_influences_read_both_ways_in_time_order(tmp_path, pg):
    # A cites B (1960) and C (1950); C cites A. Read from A: what it cites, in
    # time order, then who cites it. Read from B, the same statement is
    # 'cited_by'.
    loaded(
        tmp_path,
        pg,
        [group(A, "1978"), group(B, "1960"), group(C, "1950")],
        influences=[(A, B, "Q1$ab"), (A, C, "Q1$ac"), (C, A, "Q3$ca")],
    )
    assert influences(pg, A) == [
        ("cited", C, 1950, "Q1$ac"),
        ("cited", B, 1960, "Q1$ab"),
        ("cited_by", C, 1950, "Q3$ca"),
    ]
    assert influences(pg, B) == [("cited_by", A, 1978, "Q1$ab")]


def test_an_influence_absent_from_the_dump_has_no_name_to_show(tmp_path, pg):
    loaded(tmp_path, pg, [group(A)], influences=[(A, ABSENT, "Q1$a"), (ABSENT, A, "Q9$b")])
    assert influences(pg, A) == []
    assert influences(pg, ABSENT) == []
