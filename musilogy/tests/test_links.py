from conftest import build_synthetic, synthetic_artist

GROUP = "00000000-0000-4000-8000-0000000000a1"
PERSON = "00000000-0000-4000-8000-0000000000a2"


def membership(direction, target, begin="1990", end=None):
    return {
        "type": "member of band",
        "direction": direction,
        "mbid": target,
        "begin": begin,
        "end": end,
    }


def band_and_member(tmp_path, group_relations, person_relations):
    return build_synthetic(
        tmp_path,
        [
            synthetic_artist(GROUP, "1990", None, relations=group_relations),
            synthetic_artist(PERSON, "1970", None, relations=person_relations, kind="Person"),
        ],
    )


def links(con):
    return con.execute(
        "SELECT src_mbid, dst_mbid, type, y_begin, y_end FROM links ORDER BY ALL"
    ).fetchall()


def test_a_relation_carried_by_both_artists_lands_once_oriented_forward(tmp_path):
    # Backward on the band, forward on the member: the same relation twice in
    # the dump, one row here, from the member to the band.
    c = band_and_member(tmp_path, [membership("backward", PERSON)], [membership("forward", GROUP)])
    assert links(c) == [(PERSON, GROUP, "member of band", 1990, None)]


def test_a_relation_read_from_one_side_only_is_oriented_all_the_same(tmp_path):
    c = band_and_member(tmp_path, [membership("backward", PERSON)], [])
    assert links(c) == [(PERSON, GROUP, "member of band", 1990, None)]


def test_an_illegible_relation_date_becomes_null_instead_of_being_guessed(tmp_path):
    # "????-01" is a real shape of the reference dump. A direct CAST would
    # raise or invent a year; the link must survive with a NULL edge.
    c = band_and_member(tmp_path, [membership("backward", PERSON, "????-01", "1995")], [])
    assert links(c) == [(PERSON, GROUP, "member of band", None, 1995)]


def test_a_relation_without_a_target_is_dropped_and_its_siblings_kept(tmp_path):
    # The second relation is there on purpose: without it the assertion would
    # also hold if the whole artist had been dropped from the table.
    c = band_and_member(
        tmp_path, [membership("backward", None), membership("backward", PERSON)], []
    )
    assert links(c) == [(PERSON, GROUP, "member of band", 1990, None)]


def test_a_link_to_an_artist_outside_the_population_is_counted_not_published(tmp_path):
    # A group that is not extracted: the link has nowhere to land, and the cut
    # stays visible in the manifest counter.
    c = band_and_member(
        tmp_path, [membership("backward", PERSON)], [membership("forward", "unextracted")]
    )
    assert links(c) == [(PERSON, GROUP, "member of band", 1990, None)]
    assert c.execute(
        "SELECT not_on_page, to_unextracted_artist FROM link_exclusions"
    ).fetchone() == (
        0,
        1,
    )


def test_a_relation_of_a_life_rather_than_of_the_music_is_counted_not_published(tmp_path):
    # Teaching links two artists of the population, yet no page shows it.
    teacher = {"type": "teacher", "direction": "forward", "mbid": GROUP, "begin": None, "end": None}
    c = band_and_member(tmp_path, [membership("backward", PERSON)], [teacher])
    assert links(c) == [(PERSON, GROUP, "member of band", 1990, None)]
    assert c.execute(
        "SELECT not_on_page, to_unextracted_artist FROM link_exclusions"
    ).fetchone() == (
        1,
        0,
    )


DISINCARNATE = "a9424175-8b06-44ad-a1f4-319e92a50879"
JOY_DIVISION = "9a58fda3-f4ed-4080-a3a5-f457aac9fcdd"
CLEEF = "1434b0d0-d647-421e-b345-1b9847045a52"
BEATLES = "b10bbbfc-cf9e-42e0-be17-e2c3e1d2600d"


def test_a_witness_relations_land_with_their_member_and_their_years(con):
    # Disincarnate's two relations, transcribed as literals from the witness:
    # one closed (1991-1991), one still open (1992, no end). Re-reading them
    # from raw_artists the way 80_links.sql does would compare the table to
    # itself and pass whatever the rule computes.
    assert con.execute(
        "SELECT src_mbid, y_begin, y_end FROM links "
        "WHERE dst_mbid = ? AND type = 'member of band' ORDER BY src_mbid",
        [DISINCARNATE],
    ).fetchall() == [
        ("5b640e8d-bcb8-45be-a32e-8f4325c8d6c9", 1991, 1991),
        ("986259e3-dd6c-49a7-8679-e8cf48e799c9", 1992, None),
    ]


def test_a_month_precision_date_reads_its_year_and_a_missing_edge_stays_null(con):
    # Joy Division's memberships all end "1980-05" with no begin: the year is
    # the first four characters, and an absent edge stays absent rather than
    # being filled with the band's own dates.
    assert con.execute(
        "SELECT DISTINCT y_begin, y_end FROM links WHERE dst_mbid = ? AND type = 'member of band'",
        [JOY_DIVISION],
    ).fetchall() == [(None, 1980)]


def test_identical_relations_collapse_to_one_row(con):
    # Cleef credits the same person twice with the same (absent) dates — the
    # dump emits one relation per set of attributes. Without DISTINCT this
    # witness alone publishes the same link twice.
    assert con.execute(
        "SELECT count(*) FROM links WHERE dst_mbid = ? AND src_mbid = ?",
        [CLEEF, "1b850cda-5579-4be6-bd51-a6b6fb3ccb2b"],
    ).fetchall() == [(1,)]


def test_a_link_other_than_membership_keeps_its_musicbrainz_type(con):
    # The Quarrymen became The Beatles: the kind of link this table exists to
    # carry beside memberships, under the name MusicBrainz gives it.
    assert con.execute(
        "SELECT a.name, l.type FROM links l JOIN artists a ON a.mbid = l.src_mbid "
        "WHERE l.dst_mbid = ? AND l.type = 'artist rename'",
        [BEATLES],
    ).fetchall() == [("The Quarrymen", "artist rename")]
