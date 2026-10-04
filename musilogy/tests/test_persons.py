from conftest import build_synthetic, synthetic_artist, synthetic_release_group

BJORK = "87c5dedd-371d-4a53-9f7f-80522fb7f3cb"
BOWIE = "5441c29d-3602-4898-b1a1-b77fa23b8e50"
BACH = "24f1766e-9635-4d58-a4d4-9413f9f98a4c"
SUMNER = "6fa2e161-200e-475a-8492-3755594581f9"
JOY_DIVISION = "9a58fda3-f4ed-4080-a3a5-f457aac9fcdd"
NEW_ORDER = "f1106b17-dcbb-45f6-b938-199ccfab50cc"
ARTIST = "00000000-0000-4000-8000-000000000004"


def edges(con, mbid):
    return con.execute(
        "SELECT y_birth, y0_declared, y0, y0_source, y_end, y_end_source FROM artists "
        "WHERE mbid = ?",
        [mbid],
    ).fetchone()


def test_a_birth_is_published_as_such_and_never_starts_the_activity(con):
    # Björk, born 1965, first album 1977: read as a formation, the birth would
    # win over the album and date her activity from the cradle.
    assert edges(con, BJORK) == (1965, None, 1977, "first_album", 2022, "last_album")


def test_a_death_ends_the_activity_whatever_was_released_after_it(con):
    # David Bowie died in 2016; albums credited to him run to 2025.
    assert edges(con, BOWIE) == (1947, None, 1967, "first_album", 2016, "declared")


def test_an_artist_dead_before_min_year_takes_no_date_from_recordings(con):
    # Bach died in 1750, his first album is dated 1961: every album postdates
    # the end, so neither edge may be inferred from them.
    assert con.execute(
        "SELECT y_first_album, y_last_album FROM artists WHERE mbid = ?", [BACH]
    ).fetchone() == (1961, 2026)
    assert edges(con, BACH) == (1685, None, None, None, None, None)


def test_a_membership_is_one_link_from_the_member_to_the_band(con):
    # The dump carries the relation on Bernard Sumner's record and on each
    # band's: read from both sides, oriented forward, it must land once, from
    # him to the band.
    rows = dict(
        con.execute(
            "SELECT dst_mbid, count(*) FROM links WHERE src_mbid = ? AND type = 'member of band' "
            "GROUP BY dst_mbid",
            [SUMNER],
        ).fetchall()
    )
    assert rows[JOY_DIVISION] == rows[NEW_ORDER] == 1
    assert con.execute(
        "SELECT count(*) FROM links WHERE dst_mbid = ? AND type = 'member of band'", [SUMNER]
    ).fetchone() == (0,)


def test_a_group_ended_before_min_year_takes_no_date_from_albums_either(tmp_path):
    # The guard is not specific to persons: a group whose declared end falls
    # below the floor gets no edge from albums released after it.
    c = build_synthetic(
        tmp_path,
        [synthetic_artist(ARTIST, None, "1840")],
        [synthetic_release_group("rg-1", ARTIST, "1990")],
    )
    assert c.execute("SELECT y0, y_end FROM artists WHERE mbid = ?", [ARTIST]).fetchone() == (
        None,
        None,
    )
    assert c.execute(
        "SELECT album_with_end_below_min_year FROM neutralised_inferences"
    ).fetchone() == (1,)


def person_edges(tmp_path, begin, end, album_years):
    c = build_synthetic(
        tmp_path,
        [synthetic_artist(ARTIST, begin, end, kind="Person")],
        [synthetic_release_group(f"rg-{y}", ARTIST, str(y)) for y in album_years],
    )
    row = c.execute("SELECT y_birth, y0, y_end FROM artists WHERE mbid = ?", [ARTIST]).fetchone()
    result = c.execute("SELECT * FROM neutralised_inferences")
    counters = dict(zip([d[0] for d in result.description], result.fetchone(), strict=True))
    return row, counters


def test_a_person_born_before_min_year_takes_no_start_from_albums(tmp_path):
    # Robert Ballard, born 1575, no recorded death, one album in 2019: without
    # the guard his activity would start 444 years after his birth.
    row, counters = person_edges(tmp_path, "1575", None, [2019])
    assert row == (1575, None, 2019)
    assert counters["first_album_with_birth_below_min_year"] == 1


def test_albums_before_a_birth_date_neither_edge(tmp_path):
    # The source contradicts itself: born 2012, albums in 2010 and 2011. Each
    # guard refuses its own edge and counts it.
    row, counters = person_edges(tmp_path, "2012", None, [2010, 2011])
    assert row == (2012, None, None)
    assert counters["first_album_before_birth"] == 1
    assert counters["last_album_before_birth"] == 1


def test_a_first_album_before_birth_leaves_a_later_last_album_standing(tmp_path):
    row, counters = person_edges(tmp_path, "1978", None, [1924, 2020])
    assert row == (1978, None, 2020)
    assert counters["first_album_before_birth"] == 1
    assert counters["last_album_before_birth"] == 0


def test_a_person_without_a_birth_still_takes_both_edges_from_albums(tmp_path):
    # Most persons carry no birth. A guard that read an absent birth as NULL
    # instead of false refused the albums of all of them — 119 947 persons on
    # the reference dump before this test existed.
    row, _ = person_edges(tmp_path, None, None, [1990, 2000])
    assert row == (None, 1990, 2000)
