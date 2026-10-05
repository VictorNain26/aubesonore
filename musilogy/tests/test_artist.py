import json

from conftest import loaded, pg_query, synthetic_artist, synthetic_release_group

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


def test_no_artist_counts_as_surveyed_for_proximity_before_a_snapshot_is_loaded(tmp_path, pg):
    # An artist not surveyed is not an artist without neighbours: with no
    # proximity snapshot loaded, the card says it does not know, not false.
    loaded(tmp_path, pg, [group(A)], popularity={A: 42})
    assert pg_query(pg, f"SELECT proximity_surveyed FROM musilogy.artist_card('{A}')") == [(None,)]
    # The signature is the contract the site reads (docs/conception.md §4).
    assert pg_query(
        pg, "SELECT pg_get_function_result('musilogy.artist_card(text)'::regprocedure)"
    ) == [
        (
            "TABLE(mbid text, name text, disambiguation text, type text, country text, "
            "begin_area text, y_birth integer, y0 integer, y0_source text, y_end integer, "
            "y_end_source text, ended boolean, genres jsonb, genre_source text, "
            "listen_count bigint, user_count bigint, proximity_surveyed boolean)",
        )
    ]


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


def test_releases_come_oldest_first_with_their_types_for_the_site_to_choose(tmp_path, pg):
    loaded(
        tmp_path,
        pg,
        [group(A)],
        release_groups=[
            synthetic_release_group("rg-b", A, "1984", secondary=["Live"]),
            synthetic_release_group("rg-c", A, "", primary_type="EP"),
            synthetic_release_group("rg-a", A, "1981", primary_type="EP"),
        ],
    )
    assert pg_query(
        pg, f"SELECT mbid, primary_type, secondary, y FROM musilogy.artist_releases('{A}')"
    ) == [("rg-a", "EP", [], 1981), ("rg-b", "Album", ["Live"], 1984), ("rg-c", "EP", [], None)]
    assert pg_query(
        pg, "SELECT pg_get_function_result('musilogy.artist_releases(text)'::regprocedure)"
    ) == [
        (
            "TABLE(mbid text, title text, primary_type text, secondary text[], y integer, "
            "n_credited integer)",
        )
    ]


def test_an_ended_page_is_no_longer_the_artist_s(tmp_path, pg):
    urls = [
        {"type": "social network", "url": "https://example.invalid/old", "ended": True},
        {"type": "bandcamp", "url": "https://a.bandcamp.com/", "ended": None},
        {"type": "allmusic", "url": "https://www.allmusic.com/artist/a", "ended": False},
    ]
    loaded(tmp_path, pg, [synthetic_artist(A, "1978", "1985", urls=urls)])
    assert pg_query(pg, f"SELECT type, url FROM musilogy.artist_urls('{A}')") == [
        ("allmusic", "https://www.allmusic.com/artist/a"),
        ("bandcamp", "https://a.bandcamp.com/"),
    ]
    assert pg_query(
        pg, "SELECT pg_get_function_result('musilogy.artist_urls(text)'::regprocedure)"
    ) == [("TABLE(type text, url text)",)]
