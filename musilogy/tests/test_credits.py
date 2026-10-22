"""Credited together (86_credits.sql) on a synthetic build: MusicBrainz release
groups and Discogs records, each rule of the count made visible."""

import pytest

from musilogy.build import check_invariants
from musilogy.paths import SQL_DIR
from tests.conftest import (
    build_synthetic,
    discogs_file,
    discogs_release,
    discogs_url,
    loaded,
    official_file,
    pg_query,
    synthetic_artist,
    synthetic_release_group,
)

P = "00000000-0000-4000-8000-0000000008a1"
Q = "00000000-0000-4000-8000-0000000008a2"
R = "00000000-0000-4000-8000-0000000008a3"
S = "00000000-0000-4000-8000-0000000008a4"
M = "00000000-0000-4000-8000-0000000008a5"
RG_PQ = "00000000-0000-4000-8000-0000000009a1"
RG_PM = "00000000-0000-4000-8000-0000000009a2"
RG_PS = "00000000-0000-4000-8000-0000000009a3"


def artist(mbid, discogs_id=None, relations=None, name=None):
    urls = [discogs_url(discogs_id)] if discogs_id else None
    return synthetic_artist(mbid, "1990", None, relations=relations, name=name, urls=urls)


MEMBER = {"type": "member of band", "direction": "forward", "mbid": P, "begin": None, "end": None}
ARTISTS = [
    artist(P, 1, name="Pea"),
    artist(Q, 2, name="Queue"),
    artist(R, 3, name="Arr"),
    artist(S, 4, name="Ess"),
    artist(M, 5, [MEMBER], name="Em"),
]
RELEASE_GROUPS = [
    synthetic_release_group(RG_PQ, P, "1995", co_artists=[Q]),
    synthetic_release_group(RG_PM, P, "1996", co_artists=[M]),
    synthetic_release_group(RG_PS, P, "1997", co_artists=[S]),
]
RELEASES = [
    # Two editions of one master, and a record of its own: two records.
    discogs_release(10, [1, 2], 50),
    discogs_release(11, [1, 2], 50),
    discogs_release(12, [1, 2], 0),
    # A compilation is out of the work.
    discogs_release(13, [1, 3], 0, descriptions=["Compilation"]),
    # Eleven artists credited, most unknown to MusicBrainz: a collective's record.
    discogs_release(14, [1, 3, *range(100, 109)], 0),
    # Ten credited: it counts.
    discogs_release(15, [1, 4, *range(200, 208)], 0),
]


def built(tmp_path, releases=RELEASES):
    c = build_synthetic(
        tmp_path,
        ARTISTS,
        RELEASE_GROUPS,
        discogs=discogs_file(tmp_path / "d.jsonl", releases),
        # MusicBrainz shows P's records but the one with S: a bootleg.
        official=[official_file(tmp_path / "official.jsonl", {P: [RG_PQ, RG_PM]})],
    )
    assert check_invariants(c, SQL_DIR) == []
    return c


def credits(c, mbid=P):
    return c.execute(
        "SELECT other_mbid, records FROM credits WHERE artist_mbid = ? ORDER BY other_mbid", [mbid]
    ).fetchall()


def test_records_counted_in_the_source_with_more_of_them(tmp_path):
    # Q: one release group, two Discogs records (one master, one record of its
    # own): two, not three. S: the bootleg does not count, the ten-artist
    # Discogs record does. R: only a compilation and a collective's record.
    # M is P's member: said by `links`, not here.
    assert credits(built(tmp_path)) == [(Q, 2), (S, 1)]


def test_each_pair_both_ways(tmp_path):
    c = built(tmp_path)
    assert credits(c, Q) == [(P, 2)]
    assert credits(c, S) == [(P, 1)]


def test_a_collective_release_group_counts_every_artist_it_credits(tmp_path):
    # Eleven credited, nine of them outside the population: still a collective's record.
    outside = [f"00000000-0000-4000-8000-0000000009{i:02x}" for i in range(9)]
    c = build_synthetic(
        tmp_path,
        ARTISTS,
        [synthetic_release_group(RG_PQ, P, "1995", co_artists=[R, *outside])],
    )
    assert credits(c, R) == []


def test_musicbrainz_alone_credits_a_pair(tmp_path):
    assert credits(built(tmp_path, releases=[]), Q) == [(P, 1)]


@pytest.mark.parametrize(
    ("invariant", "mutation"),
    [
        ("credit_one_way", f"DELETE FROM credits WHERE artist_mbid = '{Q}'"),
        ("credit_without_record", f"UPDATE credits SET records = 0 WHERE artist_mbid = '{Q}'"),
        ("credit_self", f"UPDATE credits SET other_mbid = artist_mbid WHERE artist_mbid = '{Q}'"),
        ("credit_linked", f"INSERT INTO credits VALUES ('{P}', '{M}', 1), ('{M}', '{P}', 1)"),
        (
            "duplicate_credit",
            f"INSERT INTO credits SELECT * FROM credits WHERE artist_mbid = '{Q}'",
        ),
    ],
)
def test_broken_credits_are_reported(tmp_path, invariant, mutation):
    c = built(tmp_path)
    c.execute(mutation)
    assert invariant in dict(check_invariants(c, SQL_DIR))


def test_the_site_reads_the_most_credited_first_then_by_name(tmp_path, pg):
    loaded(tmp_path, pg, ARTISTS, release_groups=RELEASE_GROUPS, discogs=RELEASES)
    # Without the official snapshot, the release group with S counts too.
    assert pg_query(pg, f"SELECT mbid, name, records FROM musilogy.artist_credits('{P}')") == [
        (Q, "Queue", 2),
        (S, "Ess", 1),
    ]
    assert pg_query(
        pg,
        "SELECT pg_get_function_result(p.oid) FROM pg_proc p "
        "JOIN pg_namespace n ON n.oid = p.pronamespace "
        "WHERE n.nspname = 'musilogy' AND p.proname = 'artist_credits'",
    ) == [("TABLE(mbid text, name text, disambiguation text, y0 integer, records integer)",)]
