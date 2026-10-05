from conftest import build_synthetic, synthetic_artist, synthetic_release_group

A = "00000000-0000-4000-8000-0000000000a1"
B = "00000000-0000-4000-8000-0000000000a2"
OUTSIDER = "00000000-0000-4000-8000-0000000000a9"


def test_an_ep_joins_the_discography_without_dating_the_artist(tmp_path):
    # Case this must catch: 20_albums.sql losing its primary-type filter, so an
    # EP from 1975 moves the first album of a band that started in 1980.
    con = build_synthetic(
        tmp_path,
        [synthetic_artist(A, "1980", None)],
        [
            synthetic_release_group("rg-album", A, "1982"),
            synthetic_release_group("rg-ep", A, "1975", primary_type="EP"),
        ],
    )
    assert con.execute(
        "SELECT rg_mbid, primary_type, y FROM releases ORDER BY rg_mbid"
    ).fetchall() == [("rg-album", "Album", 1982), ("rg-ep", "EP", 1975)]
    assert con.execute("SELECT rg_mbid FROM albums").fetchall() == [("rg-album",)]
    assert con.execute("SELECT y_first_album FROM artists").fetchall() == [(1982,)]


def test_a_shared_release_is_each_credited_artist_s_and_says_how_many_share_it(tmp_path):
    con = build_synthetic(
        tmp_path,
        [synthetic_artist(A, "1980", None), synthetic_artist(B, "1980", None)],
        [synthetic_release_group("rg", A, "1990", co_artists=[B, OUTSIDER])],
    )
    # The outsider is credited but outside the population: no row of its own,
    # and still counted among those who share the release.
    assert con.execute(
        "SELECT artist_mbid, n_credited FROM releases ORDER BY artist_mbid"
    ).fetchall() == [(A, 3), (B, 3)]


def test_a_live_album_and_an_undated_ep_stay_in_the_discography(tmp_path):
    # The table keeps the whole population; which release a page shows is the
    # consumer's choice (musilogy.artist_releases).
    con = build_synthetic(
        tmp_path,
        [synthetic_artist(A, "1980", None)],
        [
            synthetic_release_group("rg-live", A, "1985", secondary=["Live"]),
            synthetic_release_group("rg-ep", A, "", primary_type="EP"),
        ],
    )
    assert con.execute(
        "SELECT rg_mbid, secondary, y FROM releases ORDER BY rg_mbid"
    ).fetchall() == [("rg-ep", [], None), ("rg-live", ["Live"], 1985)]
    assert con.execute("SELECT count(*) FROM albums").fetchone() == (0,)


BEATLES = "b10bbbfc-cf9e-42e0-be17-e2c3e1d2600d"
TWIST_AND_SHOUT_EP = "bf44e69d-bbc0-34a4-bce3-6b56aa2804ef"


def test_the_beatles_eps_join_their_discography_and_leave_their_albums_as_they_were(con):
    # The Beatles carry 62 EP release groups in the dump, "Twist and Shout"
    # (1963) among them: theirs alone, dated, with no secondary type, so only
    # the primary type keeps it out of `albums`, whose 84 rows date the group
    # (test_albums.py).
    assert con.execute(
        "SELECT primary_type, count(*) FROM releases WHERE artist_mbid = ? GROUP BY 1 ORDER BY 1",
        [BEATLES],
    ).fetchall() == [("Album", 703), ("EP", 62)]
    assert con.execute(
        "SELECT title, y FROM releases WHERE artist_mbid = ? AND rg_mbid = ?",
        [BEATLES, TWIST_AND_SHOUT_EP],
    ).fetchall() == [("Twist and Shout", 1963)]
    assert con.execute(
        "SELECT count(*) FROM albums WHERE rg_mbid = ?", [TWIST_AND_SHOUT_EP]
    ).fetchone() == (0,)
