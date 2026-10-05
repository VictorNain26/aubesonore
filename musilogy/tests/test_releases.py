import json

from conftest import build_synthetic, synthetic_artist, synthetic_release_group

A = "00000000-0000-4000-8000-0000000000a1"
B = "00000000-0000-4000-8000-0000000000a2"
OUTSIDER = "00000000-0000-4000-8000-0000000000a9"
RG_STUDIO = "10000000-0000-4000-8000-000000000001"
RG_OTHER = "10000000-0000-4000-8000-000000000002"
RG_LIVE = "10000000-0000-4000-8000-000000000003"
RG_SINGLE = "10000000-0000-4000-8000-000000000004"


def snapshot(tmp_path, rows):
    path = tmp_path / "discography.jsonl"
    path.write_text(
        "".join(json.dumps({"rg_mbid": rg, "form": form}) + "\n" for rg, form in rows),
        encoding="utf-8",
    )
    return path


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


def test_a_shared_release_is_each_credited_artist_s(tmp_path):
    con = build_synthetic(
        tmp_path,
        [synthetic_artist(A, "1980", None), synthetic_artist(B, "1980", None)],
        [synthetic_release_group("rg", A, "1990", co_artists=[B, OUTSIDER])],
    )
    # The outsider is credited but outside the population: no row of its own.
    assert con.execute("SELECT artist_mbid FROM releases ORDER BY artist_mbid").fetchall() == [
        (A,),
        (B,),
    ]


def test_soundtracks_and_remixes_are_part_of_the_work_a_live_album_is_not(tmp_path):
    # Case this must catch: the secondary-type filter dropping a soundtrack
    # (A Hard Day's Night, Help!) or a remix album or EP, or letting a live
    # recording in.
    con = build_synthetic(
        tmp_path,
        [synthetic_artist(A, "1980", None)],
        [
            synthetic_release_group("rg-film", A, "1984", secondary=["Soundtrack"]),
            synthetic_release_group("rg-remix", A, "1987", secondary=["Remix"]),
            synthetic_release_group(
                "rg-remix-ep", A, "1988", secondary=["Remix"], primary_type="EP"
            ),
            synthetic_release_group("rg-live", A, "1985", secondary=["Live"]),
            synthetic_release_group("rg-mixed", A, "1986", secondary=["Remix", "Compilation"]),
            synthetic_release_group("rg-ep", A, "", primary_type="EP"),
        ],
    )
    assert con.execute(
        "SELECT rg_mbid, soundtrack, remix, y FROM releases ORDER BY rg_mbid"
    ).fetchall() == [
        ("rg-ep", False, False, None),
        ("rg-film", True, False, 1984),
        ("rg-remix", False, True, 1987),
        ("rg-remix-ep", False, True, 1988),
    ]


def test_wikidata_s_studio_and_ep_forms_mark_new_music_its_soundtrack_form_does_not(tmp_path):
    # A film's song compilation carries the soundtrack form (Imagine: Music
    # From the Motion Picture, 1988): only a studio album or an EP says the
    # record is new music.
    con = build_synthetic(
        tmp_path,
        [synthetic_artist(A, "1980", None)],
        [
            synthetic_release_group(RG_STUDIO, A, "1982"),
            synthetic_release_group(RG_OTHER, A, "1983", secondary=["Soundtrack"]),
            synthetic_release_group(RG_LIVE, A, "1985", secondary=["Live"]),
        ],
        discography=snapshot(
            tmp_path,
            [
                (RG_STUDIO, "studio"),
                (RG_OTHER, "soundtrack"),
                (RG_LIVE, "studio"),
                (RG_SINGLE, "ep"),
                ("12-inch single", "studio"),
            ],
        ),
    )
    assert con.execute(
        "SELECT rg_mbid, filed_original FROM releases ORDER BY rg_mbid"
    ).fetchall() == [(RG_STUDIO, True), (RG_OTHER, False)]
    # "12-inch single" is the value Wikidata held as a release group ID on
    # 2026-10-05; RG_SINGLE is absent from the albums and EPs extracted; RG_LIVE
    # is left out for its secondary type.
    assert con.execute(
        "SELECT malformed, not_album_or_ep, secondary_type FROM discography_exclusions"
    ).fetchone() == (1, 1, 1)


BEATLES = "b10bbbfc-cf9e-42e0-be17-e2c3e1d2600d"
TWIST_AND_SHOUT_EP = "bf44e69d-bbc0-34a4-bce3-6b56aa2804ef"


def test_the_beatles_records_keep_their_soundtracks_and_remixes(con):
    # 110 records in the dump: 7 soundtracks, 9 remix albums (Love, Let It
    # Be... Naked, all after 1970), 29 that Wikidata files as a studio album or
    # an EP.
    assert con.execute(
        "SELECT count(*), count(*) FILTER (WHERE filed_original), "
        "count(*) FILTER (WHERE soundtrack), count(*) FILTER (WHERE remix) "
        "FROM releases WHERE artist_mbid = ?",
        [BEATLES],
    ).fetchone() == (110, 29, 7, 9)
    assert con.execute(
        "SELECT y, soundtrack, remix FROM releases WHERE artist_mbid = ? AND title = 'Love'",
        [BEATLES],
    ).fetchall() == [(2006, True, True)]


def test_the_beatles_eps_stay_out_of_their_albums(con):
    # "Twist and Shout" (1963) is theirs alone, dated, with no secondary type:
    # only the primary type keeps it out of `albums`, whose 84 rows date the
    # group (test_albums.py).
    assert con.execute(
        "SELECT count(*) FROM albums WHERE rg_mbid = ?", [TWIST_AND_SHOUT_EP]
    ).fetchone() == (0,)
