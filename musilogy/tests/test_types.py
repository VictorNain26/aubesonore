import pytest
from conftest import build_synthetic, synthetic_artist, synthetic_release_group

ARTIST = "00000000-0000-4000-8000-0000000000f1"


def built(tmp_path, kind, begin, end, album_years):
    c = build_synthetic(
        tmp_path,
        [synthetic_artist(ARTIST, begin, end, kind=kind)],
        [synthetic_release_group(f"rg-{y}", ARTIST, str(y)) for y in album_years],
    )
    row = c.execute(
        "SELECT y0_declared, y_birth, y0, y0_source, y_end, y_end_source FROM artists "
        "WHERE mbid = ?",
        [ARTIST],
    ).fetchone()
    ambiguous = c.execute("SELECT begin_ambiguous FROM r2_anomalies").fetchone()[0]
    return row, ambiguous


@pytest.mark.parametrize("kind", [None, "Character", "Other"])
def test_an_ambiguous_begin_is_dropped_and_the_first_album_starts_the_activity(tmp_path, kind):
    # Lunna, untyped, begin 1946-06-30, first album 1985: a birth, read as a
    # start it would place her 39 years too early.
    row, ambiguous = built(tmp_path, kind, "1946-06-30", None, [1985, 1990])
    assert row == (None, None, 1985, "first_album", 1990, "last_album")
    assert ambiguous == 1


def test_an_untyped_artist_keeps_its_albums_whatever_its_begin(tmp_path):
    # A begin below min_year must not reach the person guards: on a NULL type
    # they would refuse the albums, as they once did for persons.
    row, _ = built(tmp_path, None, "1500", None, [1990, 2000])
    assert row[2:] == (1990, "first_album", 2000, "last_album")


def test_an_untyped_end_still_ends_the_activity(tmp_path):
    row, ambiguous = built(tmp_path, None, None, "1999", [1990])
    assert row[4:] == (1999, "declared")
    assert ambiguous == 0


def test_a_formation_still_starts_the_activity(tmp_path):
    row, ambiguous = built(tmp_path, "Group", "1976", None, [1979])
    assert row[:4] == (1976, None, 1976, "declared")
    assert ambiguous == 0
