BEATLES = "b10bbbfc-cf9e-42e0-be17-e2c3e1d2600d"
FLEETWOOD = "bd13909f-1c29-4c27-a874-d4aaf27c5b1a"
DEMENTED = "8a1f012c-acc1-4dda-878f-43ac02f2366f"
CARDIACS = "f7338f2a-136b-4d5e-b099-5504cf997f58"
MAROON = "0ab49580-c84f-44d4-875f-d83760ea2cfe"
BIGGEST_THING_SINCE_COLOSSUS = "51c70552-4906-3b27-b3f4-f64e764551d0"
BURN_LIKE_THE_SUN = "ccb65ca4-2d61-4667-8738-c35cf8183334"
XTC = "97c86b2c-2765-46a2-aef8-76a7e24c430f"
HOMEGROWN = "62fa9b53-6e2a-3113-ba3d-7613e34071ba"
CONTRACT_DEMOS = "1ceb3a08-2174-3524-bf21-bffa7b82e432"
THE_DANCE = "1fdc9549-d42a-3f46-9b6f-f1bcc2f167fc"


def test_beatles_albums_are_not_windowed_around_y0(con):
    # The Beatles: declared end 1970, but posthumous reissues dated up to
    # 2023 are still kept — the +/-5-year window around y0/y_end that used
    # to gate `albums` is gone, only the [min_year, dump_year] bound applies.
    # 84 = 77 before {Demo} joined the allowed secondary types, plus the
    # group's seven demo-only release groups.
    assert con.execute(
        "SELECT count(*), min(y), max(y) FROM albums WHERE artist_mbid = ?", [BEATLES]
    ).fetchall() == [(84, 1963, 2023)]


def test_soundtracks_are_kept(con):
    n = con.execute(
        "SELECT count(*) FROM albums WHERE artist_mbid = ? AND soundtrack", [BEATLES]
    ).fetchone()[0]
    assert n > 0


def test_demo_is_kept(con):
    # XTC, "Homegrown" (2001), secondary types exactly {Demo}: a demo is
    # contemporaneous evidence of activity, unlike a live or a compilation
    # whose date is a publication date.
    assert con.execute(
        "SELECT artist_mbid, y FROM albums WHERE rg_mbid = ?", [HOMEGROWN]
    ).fetchall() == [(XTC, 2001)]


def test_demo_combined_with_another_secondary_type_is_dropped(con):
    # U2, "Contract Demos": {Compilation, Demo}. Demo joins Soundtrack in the
    # allowed set, it does not exempt the rest of the list.
    assert con.execute(
        "SELECT count(*) FROM albums WHERE rg_mbid = ?", [CONTRACT_DEMOS]
    ).fetchall() == [(0,)]


def test_live_is_dropped(con):
    # Fleetwood Mac, "The Dance" (1997), secondary types {Live}: MusicBrainz
    # dates a live release by its publication, not by the performance.
    assert con.execute("SELECT count(*) FROM albums WHERE rg_mbid = ?", [THE_DANCE]).fetchall() == [
        (0,)
    ]


def test_multi_artist_album_is_dropped(con):
    assert con.execute(
        "SELECT count(*) FROM albums WHERE artist_mbid = ? AND rg_mbid = ?",
        [FLEETWOOD, BIGGEST_THING_SINCE_COLOSSUS],
    ).fetchall() == [(0,)]


def test_same_artist_credited_twice_is_kept(con):
    assert con.execute(
        "SELECT count(*) FROM albums WHERE artist_mbid = ? AND title = ?",
        [DEMENTED, "The Day the Earth Spat Blood"],
    ).fetchall() == [(1,)]


def test_album_long_after_declared_end_is_kept(con):
    # Cardiacs: declared end 2020, an album dated 2025 is still kept in
    # `albums` — no window relates album selection to the band's lifespan:
    # the lifespan reads the albums, not the reverse (30_bands_lifespan.sql).
    assert con.execute(
        "SELECT max(y) FROM albums WHERE artist_mbid = ?", [CARDIACS]
    ).fetchall() == [(2025,)]


def test_album_years_are_not_bounded_by_proximity_to_formation(con):
    # Maroon 5: formed 2001 (declared). An album dated 1994, seven years
    # before formation, is kept: the old +/-5-year margin (which would have
    # excluded anything before 1996) no longer applies.
    assert con.execute("SELECT min(y) FROM albums WHERE artist_mbid = ?", [MAROON]).fetchall() == [
        (1994,)
    ]


def test_future_dated_release_group_is_dropped(con):
    # Burn Like The Sun (Inspiral Carpets), dated 2027-01-29: excluded by the
    # yr(date) <= dump_year bound, independently of any window around y0.
    assert con.execute(
        "SELECT count(*) FROM albums WHERE rg_mbid = ?", [BURN_LIKE_THE_SUN]
    ).fetchall() == [(0,)]
