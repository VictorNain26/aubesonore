from conftest import (
    build_synthetic,
    discogs_file,
    discogs_release,
    discogs_url,
    synthetic_artist,
)

from musilogy.build import check_invariants
from musilogy.paths import SQL_DIR

A = "00000000-0000-4000-8000-0000000000d1"
B = "00000000-0000-4000-8000-0000000000d2"
C = "00000000-0000-4000-8000-0000000000d3"
LABEL = (10, "Home Records")
OTHER = (20, "Reissue Co.")


def built(tmp_path, artists, releases):
    c = build_synthetic(
        tmp_path,
        artists,
        discogs=discogs_file(tmp_path / "discogs.jsonl", releases),
        discogs_dump="20261001",
    )
    assert check_invariants(c, SQL_DIR) == []
    return c


def labels(c):
    return c.execute(
        "SELECT artist_mbid, label_id, label, records, label_artists FROM labels ORDER BY ALL"
    ).fetchall()


def linked(mbid, *discogs_ids):
    return synthetic_artist(mbid, "1990", None, urls=[discogs_url(i) for i in discogs_ids])


def test_a_label_is_home_from_two_records_on(tmp_path):
    # Two editions of one master are one record: a label counting releases would
    # take a reissued single for a home.
    c = built(
        tmp_path,
        [linked(A, 1), linked(B, 2)],
        [
            discogs_release(1, [1], [LABEL], master_id=100),
            discogs_release(2, [1], [LABEL], master_id=100),
            discogs_release(3, [2], [LABEL], master_id=200),
            discogs_release(4, [2], [LABEL], master_id=201),
        ],
    )
    assert labels(c) == [(B, 10, "Home Records", 2, 1)]


def test_a_release_without_master_is_its_own_record(tmp_path):
    # The dump writes master_id 0 when a release has none: read as a master, it
    # would merge every such release of the dump into one record.
    c = built(
        tmp_path,
        [linked(A, 1)],
        [discogs_release(1, [1], [LABEL]), discogs_release(2, [1], [LABEL])],
    )
    assert labels(c) == [(A, 10, "Home Records", 2, 1)]


def test_compilations_unofficial_releases_and_promos_do_not_count(tmp_path):
    c = built(
        tmp_path,
        [linked(A, 1)],
        [
            discogs_release(1, [1], [LABEL], descriptions=["Compilation"]),
            discogs_release(2, [1], [LABEL], descriptions=["Unofficial Release", "LP"]),
            discogs_release(3, [1], [LABEL], descriptions=["Promo"]),
            discogs_release(4, [1], [LABEL], descriptions=["Album", "LP"]),
        ],
    )
    assert labels(c) == []
    assert c.execute("SELECT releases, releases_out_of_work FROM discogs_coverage").fetchone() == (
        4,
        3,
    )


def test_only_the_first_edition_says_where_the_record_was_made(tmp_path):
    # Reissued a decade later elsewhere: the reissuer holds the catalogue, it is
    # not the artist's label. A record with no dated edition keeps them all.
    c = built(
        tmp_path,
        [linked(A, 1)],
        [
            discogs_release(1, [1], [LABEL], master_id=100, released="1971"),
            discogs_release(2, [1], [OTHER], master_id=100, released="1999-05-00"),
            discogs_release(3, [1], [LABEL], master_id=101, released="1972"),
            discogs_release(4, [1], [OTHER], master_id=101, released="2004"),
            discogs_release(5, [1], [OTHER], master_id=102, released=None),
        ],
    )
    assert labels(c) == [(A, 10, "Home Records", 2, 1)]


def test_a_self_release_is_no_label(tmp_path):
    c = built(
        tmp_path,
        [linked(A, 1)],
        [
            discogs_release(1, [1], [(1818, "Not On Label")]),
            discogs_release(2, [1], [(1818, "Not On Label")]),
            discogs_release(3, [1], [(5, "Not On Label (Somebody Self-released)")]),
            discogs_release(4, [1], [(5, "Not On Label (Somebody Self-released)")]),
        ],
    )
    assert labels(c) == []


def test_label_artists_counts_the_label_homes_placeholders_aside(tmp_path):
    # Artist 3 is not linked to MusicBrainz: it still makes the label bigger.
    # Various (194) is a credit, not an artist the label is home to.
    c = built(
        tmp_path,
        [linked(A, 1)],
        [
            discogs_release(1, [1], [LABEL]),
            discogs_release(2, [1], [LABEL]),
            discogs_release(3, [3], [LABEL]),
            discogs_release(4, [3], [LABEL]),
            discogs_release(5, [194], [LABEL]),
            discogs_release(6, [194], [LABEL]),
            discogs_release(7, [4], [LABEL]),
        ],
    )
    assert labels(c) == [(A, 10, "Home Records", 2, 2)]


def test_a_discogs_artist_related_to_two_mbids_reaches_neither(tmp_path):
    c = built(
        tmp_path,
        [linked(A, 1), linked(B, 1), linked(C, 1, 2)],
        [
            discogs_release(1, [1], [LABEL], styles=["Techno"]),
            discogs_release(2, [1], [LABEL], styles=["Techno"]),
            discogs_release(3, [2], [LABEL], styles=["House"]),
        ],
    )
    assert labels(c) == []
    assert c.execute("SELECT artist_mbid, style FROM styles").fetchall() == [(C, "House")]
    assert c.execute(
        "SELECT discogs_ids_ambiguous, artists_linked FROM discogs_coverage"
    ).fetchone() == (1, 1)


def test_the_aliases_of_one_mbid_add_up(tmp_path):
    c = built(
        tmp_path,
        [linked(A, 1, 2)],
        [discogs_release(1, [1], [LABEL]), discogs_release(2, [2], [LABEL])],
    )
    assert labels(c) == [(A, 10, "Home Records", 2, 1)]


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


def test_a_build_without_discogs_has_no_label_and_no_style(tmp_path):
    c = build_synthetic(tmp_path, [linked(A, 1)])
    assert c.execute("SELECT count(*) FROM labels").fetchone() == (0,)
    assert c.execute("SELECT count(*) FROM styles").fetchone() == (0,)
