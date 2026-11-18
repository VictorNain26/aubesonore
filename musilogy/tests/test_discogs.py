import pytest

from musilogy.build import check_invariants
from tests.conftest import (
    SQL,
    build_synthetic,
    discogs_file,
    discogs_release,
    discogs_url,
    synthetic_artist,
)

A = "00000000-0000-4000-8000-0000000000d1"
B = "00000000-0000-4000-8000-0000000000d2"
C = "00000000-0000-4000-8000-0000000000d3"


def built(tmp_path, artists, releases):
    c = build_synthetic(
        tmp_path,
        artists,
        discogs=discogs_file(tmp_path / "discogs.jsonl", releases),
        discogs_dump="20261001",
    )
    assert check_invariants(c, SQL) == []
    return c


def styles(c):
    return c.execute(
        "SELECT artist_mbid, decade, style, records FROM styles ORDER BY ALL"
    ).fetchall()


def linked(mbid, *discogs_ids):
    return synthetic_artist(mbid, "1990", None, urls=[discogs_url(i) for i in discogs_ids])


def test_two_editions_of_one_master_are_one_record(tmp_path):
    c = built(
        tmp_path,
        [linked(A, 1), linked(B, 2)],
        [
            discogs_release(1, [1], master_id=100, styles=["Techno"]),
            discogs_release(2, [1], master_id=100, styles=["Techno"]),
            discogs_release(3, [2], master_id=200, styles=["Techno"]),
            discogs_release(4, [2], master_id=201, styles=["Techno"]),
        ],
    )
    assert styles(c) == [(A, 2000, "Techno", 1), (B, 2000, "Techno", 2)]


def test_a_release_without_master_is_its_own_record(tmp_path):
    # The dump writes master_id 0 when a release has none, and the extraction
    # writes null when the element is missing: read as a master, either would
    # merge every such release of the dump into one record.
    c = built(
        tmp_path,
        [linked(A, 1)],
        [
            discogs_release(1, [1], styles=["Techno"]),
            discogs_release(2, [1], master_id=None, styles=["Techno"]),
            discogs_release(3, [1], master_id=None, styles=["Techno"]),
        ],
    )
    assert styles(c) == [(A, 2000, "Techno", 3)]


@pytest.mark.parametrize(
    "description",
    [
        "Compilation",
        "Unofficial Release",
        "Partially Unofficial",
        "Promo",
        "Sampler",
        "Mixed",
        "Mixtape",
        "Partially Mixed",
    ],
)
def test_a_release_out_of_the_work_does_not_count(tmp_path, description):
    # Neither as a record of its own nor as an edition of a record of the
    # work: it lends no style, no year (1995 would date the master to the
    # 1990s) and no credit (B is credited on it alone).
    c = built(
        tmp_path,
        [linked(A, 1), linked(B, 2)],
        [
            discogs_release(1, [1], descriptions=[description, "LP"], styles=["House"]),
            discogs_release(2, [1], 100, released="2003", styles=["Techno"]),
            discogs_release(
                3, [1, 2], 100, released="1995", styles=["Ambient"], descriptions=[description]
            ),
        ],
    )
    assert styles(c) == [(A, 2000, "Techno", 1)]
    assert c.execute("SELECT releases, releases_out_of_work FROM discogs_coverage").fetchone() == (
        3,
        2,
    )


def test_a_record_is_the_artist_s_and_carries_the_styles_of_any_of_its_editions(tmp_path):
    c = built(
        tmp_path,
        [linked(A, 1), linked(B, 2)],
        [
            discogs_release(1, [1], master_id=100, styles=["Techno"]),
            discogs_release(2, [2], master_id=100, styles=["IDM"]),
        ],
    )
    assert styles(c) == [
        (A, 2000, "IDM", 1),
        (A, 2000, "Techno", 1),
        (B, 2000, "IDM", 1),
        (B, 2000, "Techno", 1),
    ]


def test_a_discogs_artist_related_to_two_mbids_reaches_neither(tmp_path):
    c = built(
        tmp_path,
        [linked(A, 1), linked(B, 1), linked(C, 1, 2)],
        [
            discogs_release(1, [1], styles=["Techno"]),
            discogs_release(2, [1], styles=["Techno"]),
            discogs_release(3, [2], styles=["House"]),
        ],
    )
    assert styles(c) == [(C, 2000, "House", 1)]
    assert c.execute(
        "SELECT discogs_ids_ambiguous, artists_linked FROM discogs_coverage"
    ).fetchone() == (1, 1)


def test_the_aliases_of_one_mbid_add_up(tmp_path):
    c = built(
        tmp_path,
        [linked(A, 1, 2)],
        [discogs_release(1, [1], styles=["Techno"]), discogs_release(2, [2], styles=["Techno"])],
    )
    assert styles(c) == [(A, 2000, "Techno", 2)]


def test_styles_count_records_by_decade_of_first_edition(tmp_path):
    # A year outside [1850, dump year] is no date: Discogs holds a release of 338.
    c = built(
        tmp_path,
        [linked(A, 1)],
        [
            discogs_release(1, [1], master_id=100, released="2003", styles=["Progressive House"]),
            discogs_release(2, [1], master_id=100, released="2012", styles=["Progressive House"]),
            discogs_release(3, [1], master_id=101, released="2014-02-03", styles=["Techno", "IDM"]),
            discogs_release(4, [1], master_id=102, released="0338", styles=["Techno"]),
        ],
    )
    assert c.execute(
        "SELECT decade, style, records FROM styles ORDER BY decade NULLS LAST, style"
    ).fetchall() == [
        (2000, "Progressive House", 1),
        (2010, "IDM", 1),
        (2010, "Techno", 1),
        (None, "Techno", 1),
    ]


def artist_styles(c, mbid):
    (got,) = c.execute("SELECT styles FROM artists WHERE mbid = ?", [mbid]).fetchone()
    return [(s["style"], s["records"]) for s in got]


def test_an_artists_styles_sum_its_decades_most_records_first(tmp_path):
    # Techno: two records of the 2000s and one undated, three in all, tied with
    # House's three of one decade, so after it by name. B relates no Discogs
    # page: its styles are an empty list.
    c = built(
        tmp_path,
        [linked(A, 1), synthetic_artist(B, "1990", None)],
        [
            discogs_release(1, [1], released="2003", styles=["Techno"]),
            discogs_release(2, [1], released="2008", styles=["Techno", "IDM"]),
            discogs_release(3, [1], released=None, styles=["Techno"]),
            *(discogs_release(10 + i, [1], released="1995", styles=["House"]) for i in range(3)),
        ],
    )
    assert artist_styles(c, A) == [("House", 3), ("Techno", 3), ("IDM", 1)]
    assert artist_styles(c, B) == []


def test_a_build_without_discogs_has_no_style(tmp_path):
    c = build_synthetic(tmp_path, [linked(A, 1)])
    assert c.execute("SELECT count(*) FROM styles").fetchone() == (0,)
    assert artist_styles(c, A) == []


def test_a_first_record_before_the_declared_formation_is_counted_not_corrected(tmp_path):
    # MusicBrainz says A formed in 1990: a Discogs record of 1985 is a
    # disagreement to show, never a new start date.
    c = built(
        tmp_path,
        [linked(A, 1), synthetic_artist(B, "1990", None, urls=[discogs_url(2)])],
        [
            discogs_release(1, [1], released="1989"),
            discogs_release(2, [2], released="1985"),
        ],
    )
    assert c.execute(
        "SELECT first_record_before_formation FROM discogs_date_disagreements"
    ).fetchone() == (1,)
    assert c.execute("SELECT y0_declared FROM artists WHERE mbid = ?", [B]).fetchone() == (1990,)
