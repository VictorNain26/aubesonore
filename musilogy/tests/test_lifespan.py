import pytest
from conftest import build_synthetic, synthetic_artist, synthetic_release_group


def counter(con, name):
    return con.execute(f"SELECT {name} FROM neutralised_inferences").fetchone()[0]


def test_first_album_fallback_is_refused_when_it_postdates_a_declared_end(tmp_path):
    # No declared begin, a declared end in 1969, and a first (only) album
    # dated 2022 (a posthumous reissue): the reissue date is not evidence of
    # formation, so y0 stays NULL rather than becoming 2022 (after the end).
    mbid = "reissue-band"
    c = build_synthetic(
        tmp_path,
        [synthetic_artist(mbid, None, "1969-01-01")],
        [synthetic_release_group("rg-1", mbid, "2022-05-01")],
    )
    row = c.execute(
        "SELECT y0, y0_source, y_first_album, y_end, y_end_source FROM artists WHERE mbid = ?",
        [mbid],
    ).fetchone()
    assert row == (None, None, 2022, 1969, "declared")
    assert counter(c, "first_album_after_declared_end") == 1


def test_first_album_fallback_is_accepted_when_it_does_not_contradict_a_declared_end(tmp_path):
    # Same shape, but the first album (1965) predates the declared end
    # (1969): the fallback is a legitimate inference of the formation year.
    mbid = "legit-fallback-band"
    c = build_synthetic(
        tmp_path,
        [synthetic_artist(mbid, None, "1969-01-01")],
        [synthetic_release_group("rg-2", mbid, "1965-03-01")],
    )
    row = c.execute(
        "SELECT y0, y0_source, y_end, y_end_source FROM artists WHERE mbid = ?", [mbid]
    ).fetchone()
    assert row == (1965, "first_album", 1969, "declared")
    assert counter(c, "first_album_after_declared_end") == 0


def test_last_album_fallback_is_refused_when_it_predates_a_declared_begin(tmp_path):
    # The mirror of the guard above, and the defect it fixes: a declared begin
    # in 2005 with a single album in 1959 used to publish y_end = 2005 — the
    # declared *begin* — under the label y_end_source = 'last_album'. An album
    # that contradicts the declared begin is no evidence of an end: y_end and
    # y_end_source both stay NULL.
    mbid = "reissued-catalogue-band"
    c = build_synthetic(
        tmp_path,
        [synthetic_artist(mbid, "2005-01-01", None)],
        [synthetic_release_group("rg-5", mbid, "1959-06-01")],
    )
    row = c.execute(
        "SELECT y0, y0_source, y_last_album, y_end, y_end_source FROM artists WHERE mbid = ?",
        [mbid],
    ).fetchone()
    assert row == (2005, "declared", 1959, None, None)
    assert counter(c, "last_album_before_declared_begin") == 1


def test_last_album_fallback_is_accepted_when_it_does_not_contradict_a_declared_begin(tmp_path):
    # Same shape, album in 2007 instead of 1959: nothing is contradicted, the
    # last album is the end's evidence.
    mbid = "ordinary-band"
    c = build_synthetic(
        tmp_path,
        [synthetic_artist(mbid, "2005-01-01", None)],
        [synthetic_release_group("rg-6", mbid, "2007-06-01")],
    )
    row = c.execute(
        "SELECT y0, y0_source, y_end, y_end_source FROM artists WHERE mbid = ?", [mbid]
    ).fetchone()
    assert row == (2005, "declared", 2007, "last_album")
    assert counter(c, "last_album_before_declared_begin") == 0


def test_first_album_fallback_is_refused_when_the_declared_begin_is_below_the_floor(tmp_path):
    # A begin in 742 is out of [min_year, dump_year], so y0_declared is NULL —
    # but the source does assert that the group predates its albums. Inferring
    # a formation in 2016 would claim more than the source says.
    mbid = "ancient-band"
    c = build_synthetic(
        tmp_path,
        [synthetic_artist(mbid, "0742", None)],
        [synthetic_release_group("rg-7", mbid, "2016-01-01")],
    )
    row = c.execute(
        "SELECT y0_declared, y_first_album, y0, y0_source FROM artists WHERE mbid = ?", [mbid]
    ).fetchone()
    assert row == (None, 2016, None, None)
    assert counter(c, "first_album_with_begin_below_min_year") == 1
    assert c.execute("SELECT begin_below_min_year FROM r2_anomalies").fetchone()[0] == 1


def test_first_album_fallback_survives_an_illegible_begin(tmp_path):
    # The boundary of the guard above: an unreadable begin asserts nothing
    # about when the group formed, unlike a readable one below the floor. The
    # first album stays admissible evidence.
    mbid = "illegible-begin-band"
    c = build_synthetic(
        tmp_path,
        [synthetic_artist(mbid, "????-01-01", None)],
        [synthetic_release_group("rg-8", mbid, "2016-01-01")],
    )
    row = c.execute("SELECT y0, y0_source FROM artists WHERE mbid = ?", [mbid]).fetchone()
    assert row == (2016, "first_album")
    assert counter(c, "first_album_with_begin_below_min_year") == 0


def test_y_end_falls_back_to_last_album_when_there_is_no_declared_end(tmp_path):
    mbid = "no-end-band"
    c = build_synthetic(
        tmp_path,
        [synthetic_artist(mbid, "1990-01-01", None)],
        [
            synthetic_release_group("rg-3", mbid, "1992-01-01"),
            synthetic_release_group("rg-4", mbid, "1998-01-01"),
        ],
    )
    row = c.execute(
        "SELECT y0, y0_source, y_end, y_end_source FROM artists WHERE mbid = ?", [mbid]
    ).fetchone()
    assert row == (1990, "declared", 1998, "last_album")


def test_y0_and_y_end_are_both_null_without_any_evidence(tmp_path):
    mbid = "no-evidence-band"
    c = build_synthetic(tmp_path, [synthetic_artist(mbid, None, None)])
    row = c.execute(
        "SELECT y0, y0_source, y_end, y_end_source FROM artists WHERE mbid = ?", [mbid]
    ).fetchone()
    assert row == (None, None, None, None)


@pytest.mark.parametrize(
    ("mbid", "expected"),
    [
        # Cardiacs: declared end 2020, an album retained in 2025. The declared
        # end wins.
        ("f7338f2a-136b-4d5e-b099-5504cf997f58", (1977, 2020, "declared")),
        # U2: no declared end, last album 2025.
        ("a3cb23fc-acd3-4ce0-8f36-1e5aa6a18432", (1976, 2025, "last_album")),
        # ROD: formed in 1996, no album retained, no end: none is invented.
        ("3cb86073-22d7-43d5-8f22-422b1e54988e", (1996, None, None)),
        # Polska Radio One, the witness of the 265-row defect: formed 2015, its
        # last album (2014) predates the begin and says nothing about an end.
        # y_end used to be published as 2015 — the declared begin — labelled
        # 'last_album'.
        ("703c4c92-43f7-4268-9f85-0ca6f0cd1a22", (2015, None, None)),
    ],
)
def test_the_witnesses_end_where_their_evidence_says(con, mbid, expected):
    assert (
        con.execute("SELECT y0, y_end, y_end_source FROM artists WHERE mbid = ?", [mbid]).fetchone()
        == expected
    )
