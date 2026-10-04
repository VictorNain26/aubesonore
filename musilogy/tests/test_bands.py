from conftest import build_synthetic, synthetic_artist


def rows(con, q):
    return con.execute(q).fetchall()


def test_an_orchestra_is_in_artists(con):
    # Wiener Philharmoniker: type Orchestra. The population is not only groups.
    orchestra = "d770374d-05e9-4ed3-a068-3fbd4e6e4dd6"
    assert con.execute("SELECT type FROM artists WHERE mbid = ?", [orchestra]).fetchone() == (
        "Orchestra",
    )


def test_unreadable_begin_yields_no_y0(con):
    # Cleef: unreadable begin, no album evidence in the fixtures either — the
    # band is kept in `artists` (complete population) but y0 stays NULL.
    assert rows(
        con,
        """
        SELECT y0, y0_source FROM artists
        WHERE mbid = '1434b0d0-d647-421e-b345-1b9847045a52'
    """,
    ) == [(None, None)]


def test_future_begin_falls_back_to_first_album(con):
    # Lethal Shock: declared begin in the future (out of [min_year,
    # dump_year]) so y0_declared is NULL, but a first album dated 2016 with
    # no declared end to contradict it — y0 falls back to y_first_album.
    assert rows(
        con,
        """
        SELECT y0_declared, y0, y0_source FROM artists
        WHERE mbid = 'd25be955-6fed-4303-bffb-8c440c191edb'
    """,
    ) == [(None, 2016, "first_album")]


def test_homonyms_without_date_or_genre_stay_in_artists_with_no_y0(con):
    assert rows(
        con,
        """
        SELECT mbid, y0, len(genres) FROM artists
        WHERE mbid IN ('9d953ee6-4ea6-4b0e-aea6-7268d380bef1',
                       '8d3431db-bc83-4dc2-93b8-0e46e31d09f7',
                       '6959c3d5-3e7f-41bb-aba3-50e38225d23d')
        ORDER BY mbid
    """,
    ) == [
        ("6959c3d5-3e7f-41bb-aba3-50e38225d23d", None, 0),
        ("8d3431db-bc83-4dc2-93b8-0e46e31d09f7", None, 0),
        ("9d953ee6-4ea6-4b0e-aea6-7268d380bef1", None, 0),
    ]


def test_end_before_begin_is_neutralised_and_band_kept(con):
    assert rows(
        con,
        """
        SELECT y0, y_end_declared FROM artists
        WHERE mbid = '53fc0417-7585-490c-b2ea-5f9737e14c0f'
    """,
    ) == [(1998, None)]


def test_unreadable_end_is_absent_but_band_kept(con):
    assert rows(
        con,
        """
        SELECT y0, y_end_declared, ended FROM artists
        WHERE mbid = '6dfa03fb-8b02-4055-b7cc-e48f426b13f8'
    """,
    ) == [(1999, None, True)]


def test_month_precision_is_reduced_to_the_year(con):
    assert rows(
        con,
        """
        SELECT y0, y_end_declared FROM artists
        WHERE mbid = '9a58fda3-f4ed-4080-a3a5-f457aac9fcdd'
    """,
    ) == [(1978, 1980)]


def test_group_without_any_genre_is_in_artists_but_carries_no_vocabulary(con):
    # Thunder Jolt: Group, dated, and neither it nor its albums carry a genre —
    # kept in `artists` all the same: the population is complete.
    thunder_jolt = "d36b0fad-abd7-44e4-88fa-f638bbf8c9a6"
    assert con.execute(
        "SELECT y0, len(genres), genre_source FROM artists WHERE mbid = ?", [thunder_jolt]
    ).fetchone() == (1970, 0, None)


def test_a_band_that_declares_no_genre_takes_its_albums(con):
    # The Belle Stars declare none; their albums carry four, which the band is
    # now found by, labelled as coming from the albums.
    belle_stars = "62f7a211-0056-45fe-934a-37a388a7356f"
    row = con.execute(
        "SELECT len(genres_declared), genre_source, genres = genres_from_albums, len(genres) "
        "FROM artists WHERE mbid = ?",
        [belle_stars],
    ).fetchone()
    assert row == (0, "albums", True, 4)


def test_declared_genres_win_over_album_genres(con):
    # Joy Division declares four genres and its albums carry five: the band is
    # found by its own four, never by a union in which albums could outvote it.
    joy_division = "9a58fda3-f4ed-4080-a3a5-f457aac9fcdd"
    row = con.execute(
        "SELECT genre_source, genres = genres_declared, len(genres_from_albums) "
        "FROM artists WHERE mbid = ?",
        [joy_division],
    ).fetchone()
    assert row == ("declared", True, 5)


def test_declared_begin_before_the_lower_bound_is_not_evidence(con):
    # Handel and Haydn Society: Group, begin=1815, before min_year=1850 —
    # y0_declared stays NULL regardless of any album fallback that might
    # independently produce a y0 for this band.
    assert rows(
        con,
        """
        SELECT y0_declared FROM artists
        WHERE mbid = '35ddcb29-4c16-4af6-b6f8-32143ee24a6c'
    """,
    ) == [(None,)]


def test_declared_begin_below_the_floor_is_not_album_evidence_either(con):
    # Handel and Haydn Society again, this time through to y0: the society
    # declares 1815 (neutralised) and owns a single album, in 2014. Publishing
    # y0 = 2014 would assert a formation the source contradicts, so the
    # first-album fallback is refused as well — y0 stays NULL.
    assert rows(
        con,
        """
        SELECT y0_declared, y_first_album, y0, y0_source FROM artists
        WHERE mbid = '35ddcb29-4c16-4af6-b6f8-32143ee24a6c'
    """,
    ) == [(None, 2014, None, None)]


def test_declared_end_below_the_floor_is_neutralised(tmp_path):
    # No witness carries an end below 1850, four artists of the reference dump
    # do (1537, 1761, 1781, 1814). The end is bounded below like the begin,
    # and the neutralisation is counted.
    mbid = "pre-floor-end-band"
    c = build_synthetic(tmp_path, [synthetic_artist(mbid, None, "1537-01-01")])
    assert c.execute(
        "SELECT y_end_declared, y_end, y_end_source FROM artists WHERE mbid = ?", [mbid]
    ).fetchone() == (None, None, None)
    assert c.execute("SELECT end_below_min_year FROM r2_anomalies").fetchone()[0] == 1


def test_future_end_is_absent_in_dated(con):
    # Thunder Jolt: end=2027-01-05, after dump_year=2026.
    assert rows(
        con,
        """
        SELECT y_end_declared FROM dated
        WHERE mbid = 'd36b0fad-abd7-44e4-88fa-f638bbf8c9a6'
    """,
    ) == [(None,)]
