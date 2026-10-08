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


C = "00000000-0000-4000-8000-0000000000f3"
ABSENT = "00000000-0000-4000-8000-0000000000f9"


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
        (RG6, "Album", False, 1992),
        (RG4, "Album", True, 1983),
        (RG3, "EP", False, 1981),
        (RG2, "Album", False, 1979),
    ]
    assert pg_query(pg, f"SELECT mbid, y FROM musilogy.artist_releases('{B}')") == [
        (RG7, 1995),
        (RG8, 1990),
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


GROUP = "00000000-0000-4000-8000-0000000000b1"
FORMER = "00000000-0000-4000-8000-0000000000b2"
OTHER_BAND = "00000000-0000-4000-8000-0000000000b3"
SILENT_BAND = "00000000-0000-4000-8000-0000000000b4"
ALIAS = "00000000-0000-4000-8000-0000000000b5"
JOINT = "00000000-0000-4000-8000-0000000000b6"
SINGER = "00000000-0000-4000-8000-0000000000c1"
DRUMMER = "00000000-0000-4000-8000-0000000000c2"


def part_of(kind, target, begin=None, end=None):
    return {"type": kind, "direction": "forward", "mbid": target, "begin": begin, "end": end}


def band_history(tmp_path, pg):
    """A group renamed from FORMER, whose singer also plays in OTHER_BAND and
    SILENT_BAND and performs as ALIAS; the drummer joined OTHER_BAND too and
    founded the group besides playing in it. SILENT_BAND has no record."""
    people = [
        synthetic_artist(
            SINGER,
            "1960",
            None,
            name="Singer",
            kind="Person",
            relations=[
                part_of("member of band", GROUP, "1990", "1999"),
                part_of("member of band", FORMER, "1988", "1990"),
                part_of("member of band", OTHER_BAND, "2001"),
                part_of("collaboration", SILENT_BAND),
                part_of("is person", ALIAS),
                part_of("member of band", JOINT, "1995"),
            ],
        ),
        synthetic_artist(
            DRUMMER,
            "1962",
            None,
            name="Drummer",
            kind="Person",
            relations=[
                part_of("member of band", GROUP, "1992", "1995"),
                part_of("founder", GROUP),
                part_of("member of band", OTHER_BAND, "2001"),
            ],
        ),
    ]
    groups = [
        # The group itself took part in OTHER_BAND: one of its own projects,
        # not one of its members'.
        group(
            GROUP,
            begin="1990",
            end="1999",
            relations=[part_of("collaboration", JOINT)],
        ),
        group(JOINT, begin="1995", end=None),
        group(FORMER, begin="1988", end="1990", relations=[part_of("artist rename", GROUP)]),
        group(OTHER_BAND, begin="2001", end=None),
        group(SILENT_BAND, begin="2005", end=None),
        synthetic_artist(ALIAS, "2010", None, name="Alias"),
    ]
    rgs = [
        synthetic_release_group(RG1, GROUP, "1991"),
        synthetic_release_group(RG2, FORMER, "1989"),
        synthetic_release_group(RG3, OTHER_BAND, "2003"),
        synthetic_release_group(RG4, ALIAS, "2011", primary_type="EP"),
        synthetic_release_group(RG5, JOINT, "1996"),
    ]
    loaded(tmp_path, pg, [*people, *groups], release_groups=rgs)


def test_being_part_of_a_group_is_one_relation_read_from_either_side(tmp_path, pg):
    # Breaks if founder and member of band land as two rows for the drummer,
    # or if a person's groups read as its members.
    band_history(tmp_path, pg)
    assert pg_query(
        pg, f"SELECT role, mbid, y_begin, y_end FROM musilogy.artist_bands('{GROUP}')"
    ) == [
        ("group", JOINT, None, None),
        ("member", SINGER, 1990, 1999),
        ("member", DRUMMER, 1992, 1995),
    ]
    assert pg_query(pg, f"SELECT role, mbid, y_begin FROM musilogy.artist_bands('{SINGER}')") == [
        ("group", FORMER, 1988),
        ("group", GROUP, 1990),
        ("group", JOINT, 1995),
        ("group", OTHER_BAND, 2001),
        ("group", SILENT_BAND, None),
    ]


def test_the_members_projects_lead_only_to_music(tmp_path, pg):
    # OTHER_BAND is reached through both members, ALIAS is the singer's solo
    # name. SILENT_BAND has no record, FORMER is the group's own former name:
    # neither shows, nor the group itself.
    band_history(tmp_path, pg)
    assert pg_query(pg, f"SELECT mbid, via FROM musilogy.artist_member_projects('{GROUP}')") == [
        (OTHER_BAND, ["Drummer", "Singer"]),
        (ALIAS, ["Singer"]),
    ]
    assert pg_query(pg, f"SELECT mbid FROM musilogy.artist_member_projects('{SINGER}')") == []


def test_other_names_read_both_ways(tmp_path, pg):
    band_history(tmp_path, pg)
    assert pg_query(pg, f"SELECT kind, mbid FROM musilogy.artist_other_names('{GROUP}')") == [
        ("former", FORMER)
    ]
    assert pg_query(pg, f"SELECT kind, mbid FROM musilogy.artist_other_names('{FORMER}')") == [
        ("later", GROUP)
    ]
    assert pg_query(pg, f"SELECT kind, mbid FROM musilogy.artist_other_names('{SINGER}')") == [
        ("alias", ALIAS)
    ]
    assert pg_query(pg, f"SELECT kind, mbid FROM musilogy.artist_other_names('{ALIAS}')") == [
        ("person", SINGER)
    ]


def test_the_band_sections_keep_the_signatures_the_site_reads(tmp_path, pg):
    # The contract of docs/conception.md §4.
    band_history(tmp_path, pg)
    assert pg_query(
        pg,
        "SELECT p.proname, pg_get_function_result(p.oid) FROM pg_proc p "
        "JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'musilogy' "
        "AND p.proname IN ('artist_bands', 'artist_member_projects', 'artist_other_names') "
        "ORDER BY 1",
    ) == [
        (
            "artist_bands",
            "TABLE(role text, mbid text, name text, disambiguation text, y0 integer, "
            "y_begin integer, y_end integer)",
        ),
        (
            "artist_member_projects",
            "TABLE(mbid text, name text, disambiguation text, y0 integer, via text[])",
        ),
        (
            "artist_other_names",
            "TABLE(kind text, mbid text, name text, disambiguation text, y0 integer)",
        ),
    ]


D = "00000000-0000-4000-8000-0000000000f4"
E = "00000000-0000-4000-8000-0000000000f5"


def neighbours(conninfo, mbid):
    return pg_query(conninfo, f"SELECT mbid, rank, side FROM musilogy.artist_neighbours('{mbid}')")


def test_neighbours_come_in_rank_order_each_with_its_side_in_time(tmp_path, pg):
    # A began in 1978. B (1960) is more than 3 years before, D (1982) more than
    # 3 after, C (1975) exactly 3 before: during. E has no year: no side. The
    # neighbour absent from the dump has no name to show and is left out,
    # without renumbering the others.
    loaded(
        tmp_path,
        pg,
        [group(A, "1978"), group(B, "1960"), group(C, "1975"), group(D, "1982"), group(E, None)],
        proximity={A: [(D, 90), (ABSENT, 80), (B, 70), (E, 60), (C, 50)]},
    )
    assert neighbours(pg, A) == [
        (D, 1, "after"),
        (B, 3, "before"),
        (E, 4, None),
        (C, 5, "during"),
    ]


def test_an_artist_absent_from_the_dump_has_no_neighbours(tmp_path, pg):
    loaded(tmp_path, pg, [group(A)], proximity={ABSENT: [(A, 90)]})
    assert neighbours(pg, ABSENT) == []


def test_the_card_tells_a_surveyed_artist_from_one_never_asked(tmp_path, pg):
    # A was asked and has no neighbour; B was never asked. Only B's empty list
    # is no answer.
    loaded(tmp_path, pg, [group(A), group(B)], proximity={A: []})
    assert pg_query(
        pg,
        f"SELECT mbid, proximity_surveyed FROM musilogy.artist_card('{A}') "
        f"UNION ALL SELECT mbid, proximity_surveyed FROM musilogy.artist_card('{B}')",
    ) == [(A, True), (B, False)]
