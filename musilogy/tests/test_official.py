from conftest import (
    SQL,
    build_synthetic,
    loaded,
    official_file,
    pg_query,
    synthetic_artist,
    synthetic_release_group,
)
from test_invariants import restored

from musilogy.build import check_invariants

A = "00000000-0000-4000-8000-0000000000d1"
B = "00000000-0000-4000-8000-0000000000d2"
MERGED = "00000000-0000-4000-8000-0000000000d3"
LISTED = "20000000-0000-4000-8000-000000000001"
BOOTLEG = "20000000-0000-4000-8000-000000000002"
UNSURVEYED = "20000000-0000-4000-8000-000000000003"
SHARED = "20000000-0000-4000-8000-000000000004"
SPLIT = "20000000-0000-4000-8000-000000000005"
OF_MERGED = "20000000-0000-4000-8000-000000000006"

RGS = [
    synthetic_release_group(LISTED, A, "1979"),
    synthetic_release_group(BOOTLEG, A, "1981"),
    synthetic_release_group(UNSURVEYED, B, "1980"),
    # Credited to A and B: A was asked and does not list it, B was not asked.
    synthetic_release_group(SHARED, A, "1982", co_artists=[B]),
    # Credited to B and A: A lists it.
    synthetic_release_group(SPLIT, B, "1983", co_artists=[A]),
    synthetic_release_group(OF_MERGED, MERGED, "1984"),
]
# MusicBrainz no longer holds MERGED under its MBID: asked, but unanswered.
SURVEY = {A: [LISTED, SPLIT], MERGED: None}


def statuses(c):
    return dict(c.execute("SELECT DISTINCT rg_mbid, official FROM releases").fetchall())


def built(tmp_path):
    return build_synthetic(
        tmp_path,
        [synthetic_artist(m, "1975", None) for m in (A, B, MERGED)],
        RGS,
        official=[official_file(tmp_path / "official.jsonl", SURVEY)],
    )


def test_a_record_is_official_when_a_surveyed_credited_artist_lists_it(tmp_path):
    c = built(tmp_path)
    assert statuses(c) == {
        LISTED: True,
        BOOTLEG: False,
        UNSURVEYED: None,
        SHARED: False,
        SPLIT: True,
        OF_MERGED: None,
    }
    assert c.execute("SELECT * FROM release_status").fetchone() == (2, 2, 2)
    assert check_invariants(c, SQL) == []


def test_without_a_survey_every_status_is_unknown(tmp_path):
    c = build_synthetic(tmp_path, [synthetic_artist(A, "1975", None)], RGS[:2])
    assert set(statuses(c).values()) == {None}


def test_official_unsourced_catches_a_flipped_status(tmp_path):
    c = built(tmp_path)
    undo = "UPDATE releases SET official = ? WHERE rg_mbid = ?"
    with restored(c, (undo, [False, BOOTLEG])):
        c.execute(undo, [True, BOOTLEG])
        assert dict(check_invariants(c, SQL)).get("official_unsourced") == 1


def test_an_artist_asked_by_two_parts_of_the_official_survey_is_reported(tmp_path):
    c = build_synthetic(
        tmp_path,
        [synthetic_artist(A, "1975", None)],
        RGS[:1],
        official=[
            official_file(tmp_path / "o1.jsonl", {A: [LISTED]}),
            official_file(tmp_path / "o2.jsonl", {A: []}),
        ],
    )
    assert dict(check_invariants(c, SQL)).get("official_asked_twice") == 1


def test_a_bootleg_is_off_the_page_and_never_dates_the_first_album(tmp_path, pg):
    # A bootleg album of 1975 would make the EP of 1977 a record after the
    # first album; without it, the first album is 1979 and the EP stays off.
    rgs = [
        synthetic_release_group(BOOTLEG, A, "1975"),
        synthetic_release_group(SHARED, A, "1977", primary_type="EP"),
        synthetic_release_group(LISTED, A, "1979"),
    ]
    loaded(
        tmp_path,
        pg,
        [synthetic_artist(A, "1975", None)],
        release_groups=rgs,
        official={A: [LISTED, SHARED]},
    )
    assert pg_query(pg, f"SELECT mbid, y FROM musilogy.artist_releases('{A}')") == [(LISTED, 1979)]
