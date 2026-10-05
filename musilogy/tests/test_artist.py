import json

from conftest import loaded, pg_query, synthetic_artist, synthetic_release_group

A = "00000000-0000-4000-8000-0000000000f1"
B = "00000000-0000-4000-8000-0000000000f2"
RG1 = "10000000-0000-4000-8000-0000000000f1"
RG2 = "10000000-0000-4000-8000-0000000000f2"
RG3 = "10000000-0000-4000-8000-0000000000f3"
RG4 = "10000000-0000-4000-8000-0000000000f4"
RG5 = "10000000-0000-4000-8000-0000000000f5"
RG6 = "10000000-0000-4000-8000-0000000000f6"
RG7 = "10000000-0000-4000-8000-0000000000f7"
RG8 = "10000000-0000-4000-8000-0000000000f8"
RG9 = "10000000-0000-4000-8000-0000000000f9"
RG10 = "10000000-0000-4000-8000-0000000000fa"


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


def test_a_page_shows_the_work_from_the_first_album_to_the_declared_end(tmp_path, pg):
    # A, a group that ended in 1985: the EP before its first album and the
    # album after its end stay out; the posthumous album Wikidata files as a
    # studio album is new music and shows. B has no dated album: its EPs show,
    # and of its two undated records only the one Wikidata files.
    rgs = [
        synthetic_release_group(RG1, A, "1977", primary_type="EP"),
        synthetic_release_group(RG2, A, "1979"),
        synthetic_release_group(RG3, A, "1981", primary_type="EP"),
        synthetic_release_group(RG4, A, "1983", secondary=["Remix"]),
        synthetic_release_group(RG5, A, "1990"),
        synthetic_release_group(RG6, A, "1992"),
        synthetic_release_group(RG7, B, "1995", primary_type="EP"),
        synthetic_release_group(RG8, B, "1990", primary_type="EP"),
        synthetic_release_group(RG9, B, ""),
        synthetic_release_group(RG10, B, "", primary_type="EP"),
    ]
    loaded(
        tmp_path,
        pg,
        [group(A, begin="1976", end="1985"), group(B, begin="1989", end=None)],
        release_groups=rgs,
        discography=[(RG6, "studio"), (RG10, "ep")],
    )
    assert pg_query(
        pg, f"SELECT mbid, primary_type, remix, y FROM musilogy.artist_releases('{A}')"
    ) == [
        (RG2, "Album", False, 1979),
        (RG3, "EP", False, 1981),
        (RG4, "Album", True, 1983),
        (RG6, "Album", False, 1992),
    ]
    assert pg_query(pg, f"SELECT mbid, y FROM musilogy.artist_releases('{B}')") == [
        (RG8, 1990),
        (RG7, 1995),
        (RG10, None),
    ]
    assert pg_query(
        pg, "SELECT pg_get_function_result('musilogy.artist_releases(text)'::regprocedure)"
    ) == [
        (
            "TABLE(mbid text, title text, primary_type text, soundtrack boolean, "
            "remix boolean, y integer)",
        )
    ]


def test_an_ended_page_is_no_longer_the_artist_s(tmp_path, pg):
    pages = [
        ("official homepage", "https://example.invalid/old", True),
        ("bandcamp", "https://a.bandcamp.com/", None),
        ("free streaming", "https://www.deezer.com/artist/1", False),
    ]
    urls = [{"type": kind, "url": url, "ended": ended} for kind, url, ended in pages]
    loaded(tmp_path, pg, [synthetic_artist(A, "1978", "1985", urls=urls)])
    assert pg_query(pg, f"SELECT type, url FROM musilogy.artist_urls('{A}')") == [
        ("bandcamp", "https://a.bandcamp.com/"),
        ("free streaming", "https://www.deezer.com/artist/1"),
    ]
    assert pg_query(
        pg, "SELECT pg_get_function_result('musilogy.artist_urls(text)'::regprocedure)"
    ) == [("TABLE(type text, url text)",)]
