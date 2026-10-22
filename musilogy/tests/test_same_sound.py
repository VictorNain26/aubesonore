"""« Même son » (samesound.py) on a synthetic build: the Discogs records below
make each rule of the colour visible, with no listens at all."""

import pytest

from musilogy import samesound
from musilogy.build import check_invariants
from musilogy.paths import SQL_DIR
from tests.conftest import (
    build_synthetic,
    discogs_file,
    discogs_release,
    discogs_url,
    loaded,
    pg_query,
    synthetic_artist,
    synthetic_release_group,
)

A = "00000000-0000-4000-8000-0000000005a1"
B = "00000000-0000-4000-8000-0000000005a2"
C = "00000000-0000-4000-8000-0000000005a3"
D = "00000000-0000-4000-8000-0000000005a4"
E = "00000000-0000-4000-8000-0000000005a5"
F = "00000000-0000-4000-8000-0000000005a6"
G = "00000000-0000-4000-8000-0000000005a7"
ABSENT = "00000000-0000-4000-8000-0000000005ff"


def artist(mbid, discogs_id=None, begin="1970"):
    return synthetic_artist(
        mbid, begin, None, urls=[discogs_url(discogs_id)] if discogs_id else None
    )


def records(discogs_id, style, year, n, first_id):
    """n records of one style and year, each its own master."""
    return [discogs_release(first_id + i, [discogs_id], 0, year, [style]) for i in range(n)]


# A and B: Krautrock of the 1970s, thirty records each. C: synth-pop only.
# D: Krautrock, but of the 1990s. E: no Discogs records. F: Krautrock of the
# 1980s. G: rock, so that Krautrock is not every artist's style.
ARTISTS = [
    artist(A, 1),
    artist(B, 2),
    artist(C, 3),
    artist(D, 4),
    artist(E),
    artist(F, 5),
    artist(G, 6),
]
RELEASES = [
    *records(1, "Krautrock", "1972", 30, 100),
    *records(2, "Krautrock", "1974", 30, 200),
    *records(3, "Synth-pop", "1983", 30, 300),
    *records(4, "Krautrock", "1994", 30, 400),
    *records(5, "Krautrock", "1981", 30, 500),
    *records(6, "Rock", "1975", 30, 600),
]


def built(tmp_path, artists=ARTISTS, releases=RELEASES):
    c = build_synthetic(tmp_path, artists, discogs=discogs_file(tmp_path / "d.jsonl", releases))
    assert check_invariants(c, SQL_DIR) == []
    return c


def same_sound(c, mbid=A):
    return c.execute(
        "SELECT neighbour_mbid, rank, term FROM same_sound WHERE artist_mbid = ? ORDER BY rank",
        [mbid],
    ).fetchall()


def test_the_closest_colours_among_every_artist_with_one(tmp_path):
    # No listens at all: the colour alone finds B, D and F, whatever their
    # decade, tied and so ranked by MBID. C and G share no style with A, and
    # E has no Discogs records, so no colour.
    assert same_sound(built(tmp_path)) == [
        (B, 1, "Krautrock"),
        (D, 2, "Krautrock"),
        (F, 3, "Krautrock"),
    ]


def test_a_thin_profile_is_shrunk_behind_the_others(tmp_path):
    # Three records, the same style as A: a perfect cosine, shrunk by
    # 3 / (3 + 10), so behind D and F, shrunk by 30 / (30 + 10).
    releases = [r for r in RELEASES if r["artists"] != [2]] + records(
        2, "Krautrock", "1974", 3, 200
    )
    assert [row[0] for row in same_sound(built(tmp_path, releases=releases))] == [D, F, B]


def test_a_profile_of_undated_records_is_nobodys_neighbour(tmp_path):
    # B's thirty records carry no date: shrunk by 0 / (0 + 10), as measured.
    # B still has a colour of its own, and neighbours.
    releases = [r for r in RELEASES if r["artists"] != [2]] + records(2, "Krautrock", None, 30, 200)
    c = built(tmp_path, releases=releases)
    assert [row[0] for row in same_sound(c)] == [D, F]
    assert [row[0] for row in same_sound(c, B)] == [A, D, F]


def test_under_three_records_an_artist_has_no_colour(tmp_path):
    releases = [r for r in RELEASES if r["artists"] != [2]] + records(
        2, "Krautrock", "1974", 2, 200
    )
    c = built(tmp_path, releases=releases)
    assert [row[0] for row in same_sound(c)] == [D, F]
    assert same_sound(c, B) == []


def test_the_shrink_counts_only_the_dated_records(tmp_path):
    # B: three dated Krautrock records and forty undated ones. Shrunk by
    # 3 / (3 + 10), not 43 / (43 + 10): the rule as measured.
    releases = [
        *(r for r in RELEASES if r["artists"] != [2]),
        *records(2, "Krautrock", "1974", 3, 200),
        *records(2, "Krautrock", None, 40, 300_000),
    ]
    assert [row[0] for row in same_sound(built(tmp_path, releases=releases))] == [D, F, B]


def test_the_reason_is_the_style_that_weighs_most_in_what_the_two_share(tmp_path):
    # A and B also share Kosmische, on fewer records: Krautrock stays the reason.
    releases = [
        *RELEASES,
        *records(1, "Kosmische", "1973", 5, 700),
        *records(2, "Kosmische", "1975", 5, 800),
    ]
    assert same_sound(built(tmp_path, releases=releases))[0] == (B, 1, "Krautrock")


def test_the_reason_sums_a_style_over_its_decades(tmp_path):
    # Krautrock is the heaviest style of a single decade (12 records against
    # 8), but Ambient sums 16 over the 1980s and the 1990s.
    releases = [
        *records(1, "Krautrock", "1972", 12, 100),
        *records(1, "Ambient", "1983", 8, 120),
        *records(1, "Ambient", "1994", 8, 140),
        *records(2, "Krautrock", "1974", 12, 200),
        *records(2, "Ambient", "1985", 8, 220),
        *records(2, "Ambient", "1996", 8, 240),
        *records(6, "Rock", "1975", 30, 600),
    ]
    c = built(tmp_path, [artist(A, 1), artist(B, 2), artist(G, 6)], releases)
    assert same_sound(c) == [(B, 1, "Ambient")]


def test_only_the_k_closest_are_kept(tmp_path, monkeypatch):
    monkeypatch.setattr(samesound, "K", 2)
    assert [row[0] for row in same_sound(built(tmp_path))] == [B, D]


def test_batches_and_workers_give_the_same_table(tmp_path, monkeypatch):
    whole = built(tmp_path).execute("SELECT * FROM same_sound ORDER BY ALL").fetchall()
    monkeypatch.setattr(samesound, "BATCH", 2)
    split = built(tmp_path).execute("SELECT * FROM same_sound ORDER BY ALL").fetchall()
    assert split == whole


def test_no_records_give_no_same_sound(tmp_path):
    c = build_synthetic(tmp_path, ARTISTS)
    assert c.execute("SELECT count(*) FROM same_sound").fetchone() == (0,)


A_B = f"artist_mbid = '{A}' AND neighbour_mbid = '{B}'"


@pytest.mark.parametrize(
    ("invariant", "mutation"),
    [
        # B and D tie on the colour: the tie must fall to the MBID.
        (
            "same_sound_out_of_order",
            f"UPDATE same_sound SET rank = 3 - rank WHERE artist_mbid = '{A}' AND rank <= 2",
        ),
        ("same_sound_unexplained", f"UPDATE same_sound SET term = 'Rock' WHERE {A_B}"),
        ("same_sound_self", f"UPDATE same_sound SET neighbour_mbid = artist_mbid WHERE {A_B}"),
        (
            "same_sound_rank_out_of_range",
            f"UPDATE same_sound SET rank = 9 WHERE artist_mbid = '{A}' AND neighbour_mbid = '{F}'",
        ),
        ("same_sound_score_out_of_range", f"UPDATE same_sound SET score = 0 WHERE {A_B}"),
    ],
)
def test_a_broken_same_sound_is_reported(tmp_path, invariant, mutation):
    c = built(tmp_path)
    c.execute(mutation)
    assert invariant in dict(check_invariants(c, SQL_DIR))


def test_the_site_reads_same_sound_in_rank_order_each_with_its_reason(tmp_path, pg):
    loaded(tmp_path, pg, ARTISTS, discogs=RELEASES)
    assert pg_query(pg, f"SELECT mbid, rank, term FROM musilogy.artist_same_sound('{A}')") == [
        (B, 1, "Krautrock"),
        (D, 2, "Krautrock"),
        (F, 3, "Krautrock"),
    ]
    assert pg_query(pg, f"SELECT count(*) FROM musilogy.artist_same_sound('{ABSENT}')") == [(0,)]


def test_the_site_reads_a_neighbours_end_only_when_declared(tmp_path, pg):
    # B declares its end; D's is only the year of its last album, which is not an end.
    artists = [
        *(a for a in ARTISTS if a["mbid"] != B),
        synthetic_artist(B, "1970", "1979", urls=[discogs_url(2)]),
    ]
    loaded(
        tmp_path,
        pg,
        artists,
        release_groups=[synthetic_release_group("00000000-0000-4000-8000-0000000007d1", D, "1999")],
        discogs=RELEASES,
    )
    assert pg_query(pg, f"SELECT y_end, y_end_source FROM musilogy.artists WHERE mbid = '{D}'") == [
        (1999, "last_album")
    ]
    ends = dict(pg_query(pg, f"SELECT mbid, y_end FROM musilogy.artist_same_sound('{A}')"))
    assert (ends[B], ends[D]) == (1979, None)


def test_artist_same_sound_keeps_the_signature_the_site_reads(tmp_path, pg):
    loaded(tmp_path, pg, ARTISTS)
    assert pg_query(
        pg,
        "SELECT pg_get_function_result(p.oid) FROM pg_proc p "
        "JOIN pg_namespace n ON n.oid = p.pronamespace "
        "WHERE n.nspname = 'musilogy' AND p.proname = 'artist_same_sound'",
    ) == [
        (
            "TABLE(mbid text, name text, disambiguation text, y0 integer, y_end integer, "
            "ended boolean, rank integer, term text)",
        )
    ]
