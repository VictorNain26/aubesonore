"""« Même son » (88_same_sound.sql) on a synthetic build: six listeners share
every artist, so the co-listening ranks A's neighbours by MBID, and the
Discogs records and MusicBrainz genres below make each rule of the colour
visible."""

from conftest import (
    build_synthetic,
    discogs_file,
    discogs_release,
    discogs_url,
    listening_file,
    loaded,
    pg_query,
    synthetic_artist,
)

from musilogy.build import check_invariants
from musilogy.paths import SQL_DIR

A = "00000000-0000-4000-8000-0000000005a1"
B = "00000000-0000-4000-8000-0000000005a2"
C = "00000000-0000-4000-8000-0000000005a3"
D = "00000000-0000-4000-8000-0000000005a4"
E = "00000000-0000-4000-8000-0000000005a5"
F = "00000000-0000-4000-8000-0000000005a6"
G = "00000000-0000-4000-8000-0000000005a7"
ABSENT = "00000000-0000-4000-8000-0000000005ff"


def genre(name, votes=9):
    return {"mbid": f"g-{name}", "name": name, "votes": votes}


def artist(mbid, discogs_id=None, genres=(), begin="1970"):
    return synthetic_artist(
        mbid,
        begin,
        None,
        genres=[genre(g) for g in genres],
        urls=[discogs_url(discogs_id)] if discogs_id else None,
    )


def records(discogs_id, style, year, n, first_id):
    """n records of one style and year, each its own master."""
    return [discogs_release(first_id + i, [discogs_id], 0, year, [style]) for i in range(n)]


# A and B: Krautrock of the 1970s, thirty records each. C: synth-pop only.
# D: Krautrock, but of the 1990s, and the genre A carries. E: no Discogs
# records, A's genre. F: Krautrock of the 1980s, the decade next to A's. G: rock,
# so that Krautrock is not every artist's style.
ARTISTS = [
    artist(A, 1, ["krautrock"]),
    artist(B, 2),
    artist(C, 3, ["synth-pop"]),
    artist(D, 4, ["krautrock"]),
    artist(E, None, ["krautrock"]),
    artist(F, 5),
    artist(G, 6, ["rock"]),
]
RELEASES = [
    *records(1, "Krautrock", "1972", 30, 100),
    *records(2, "Krautrock", "1974", 30, 200),
    *records(3, "Synth-pop", "1983", 30, 300),
    *records(4, "Krautrock", "1994", 30, 400),
    *records(5, "Krautrock", "1981", 30, 500),
    *records(6, "Rock", "1975", 30, 600),
]
LISTENERS = {user: [A, B, C, D, E, F] for user in range(1, 7)}


def built(tmp_path, artists=ARTISTS, releases=RELEASES, listeners=LISTENERS):
    c = build_synthetic(
        tmp_path,
        artists,
        listening=listening_file(tmp_path / "artists_all_time.jsonl", listeners),
        discogs=discogs_file(tmp_path / "discogs.jsonl", releases),
    )
    assert check_invariants(c, SQL_DIR) == []
    return c


def same_sound(c, mbid=A):
    return c.execute(
        "SELECT neighbour_mbid, rank, colisten_rank, source, term, decade FROM same_sound "
        "WHERE artist_mbid = ? ORDER BY rank",
        [mbid],
    ).fetchall()


def test_only_the_neighbours_whose_colour_agrees_ranked_again_in_the_colisten_order(tmp_path):
    # B shares A's style and decade. C shares nothing. D shares the style 20
    # years apart: no colour, and its styles hide the genre it shares. E has no
    # Discogs records: its genre speaks. F's decade is next to A's: half the
    # weight, still above the threshold.
    assert same_sound(built(tmp_path)) == [
        (B, 1, 1, "styles", "Krautrock", 1970),
        (E, 2, 4, "genres", "krautrock", None),
        (F, 3, 5, "styles", "Krautrock", 1970),
    ]


def test_a_thin_profile_is_shrunk_below_the_threshold(tmp_path):
    # Three records, the same style and decade as A: a perfect cosine, shrunk
    # by 3 / (3 + 10).
    releases = [r for r in RELEASES if r["artists"] != [2]] + records(
        2, "Krautrock", "1974", 3, 200
    )
    assert [row[0] for row in same_sound(built(tmp_path, releases=releases))] == [E, F]


def test_a_profile_of_undated_records_has_no_colour(tmp_path):
    # B's thirty records carry no date: a style without a decade never matches,
    # and its profile has no length. 0 / 0 is a NaN, which DuckDB sorts above
    # every threshold; and B's Discogs styles still hide its genres.
    artists = [*(a for a in ARTISTS if a["mbid"] != B), artist(B, 2, ["krautrock"])]
    releases = [r for r in RELEASES if r["artists"] != [2]] + records(2, "Krautrock", None, 30, 200)
    assert [row[0] for row in same_sound(built(tmp_path, artists, releases))] == [E, F]


def test_the_reason_is_the_style_that_weighs_most_in_what_the_two_share(tmp_path):
    # A and B also share Kosmische, on fewer records: Krautrock stays the reason.
    releases = [
        *RELEASES,
        *records(1, "Kosmische", "1973", 5, 700),
        *records(2, "Kosmische", "1975", 5, 800),
    ]
    assert same_sound(built(tmp_path, releases=releases))[0][4:] == ("Krautrock", 1970)


def test_the_reason_sums_a_style_over_its_decades(tmp_path):
    # Krautrock is the heaviest single term (12 records against 8), but the two
    # share Ambient in the 1980s and the 1990s, which meet across the decade:
    # 3 x 8 x 8 outweighs 12 x 12. Within Ambient, the two decades weigh the
    # same: the earlier one.
    releases = [
        *records(1, "Krautrock", "1972", 12, 100),
        *records(1, "Ambient", "1983", 8, 120),
        *records(1, "Ambient", "1994", 8, 140),
        *records(2, "Krautrock", "1974", 12, 200),
        *records(2, "Ambient", "1985", 8, 220),
        *records(2, "Ambient", "1996", 8, 240),
        *records(6, "Rock", "1975", 30, 600),
    ]
    c = built(
        tmp_path,
        [artist(A, 1), artist(B, 2), artist(G, 6)],
        releases,
        {user: [A, B] for user in range(1, 7)},
    )
    assert same_sound(c) == [(B, 1, 1, "styles", "Ambient", 1980)]


def test_no_listening_export_gives_no_same_sound(tmp_path):
    c = build_synthetic(tmp_path, ARTISTS, discogs=discogs_file(tmp_path / "d.jsonl", RELEASES))
    assert c.execute("SELECT count(*) FROM same_sound").fetchone() == (0,)


def test_the_site_reads_same_sound_in_rank_order_each_with_its_reason_and_side(tmp_path, pg):
    # A began in 1970; B (1960) more than 3 years before, E (1982) after, F
    # (1972) during. A neighbour absent from the dump is left out.
    artists = [
        artist(A, 1, ["krautrock"], "1970"),
        artist(B, 2, begin="1960"),
        artist(C, 3, ["synth-pop"]),
        artist(D, 4, ["krautrock"]),
        artist(E, None, ["krautrock"], "1982"),
        artist(F, 5, begin="1972"),
        artist(G, 6, ["rock"]),
    ]
    loaded(tmp_path, pg, artists, listening=LISTENERS, discogs=RELEASES)
    assert pg_query(
        pg,
        f"SELECT mbid, rank, source, term, decade, side FROM musilogy.artist_same_sound('{A}')",
    ) == [
        (B, 1, "styles", "Krautrock", 1970, "before"),
        (E, 2, "genres", "krautrock", None, "after"),
        (F, 3, "styles", "Krautrock", 1970, "during"),
    ]
    assert pg_query(pg, f"SELECT count(*) FROM musilogy.artist_same_sound('{ABSENT}')") == [(0,)]


def test_artist_same_sound_keeps_the_signature_the_site_reads(tmp_path, pg):
    loaded(tmp_path, pg, ARTISTS)
    assert pg_query(
        pg,
        "SELECT pg_get_function_result(p.oid) FROM pg_proc p "
        "JOIN pg_namespace n ON n.oid = p.pronamespace "
        "WHERE n.nspname = 'musilogy' AND p.proname = 'artist_same_sound'",
    ) == [
        (
            "TABLE(mbid text, name text, disambiguation text, type text, y0 integer, "
            "y_end integer, ended boolean, rank integer, source text, term text, "
            "decade integer, side text)",
        )
    ]


def test_the_site_reads_the_first_8_the_depth_the_rule_was_measured_at(tmp_path, pg):
    # Ten neighbours of A's very colour: the table keeps them all, the page
    # reads the first 8.
    near = [f"00000000-0000-4000-8000-0000000006{i:02x}" for i in range(10)]
    artists = [artist(A, 1, ["krautrock"]), *(artist(n, 10 + i) for i, n in enumerate(near))]
    releases = [
        *records(1, "Krautrock", "1972", 30, 100),
        *(r for i in range(10) for r in records(10 + i, "Krautrock", "1974", 30, 1000 + 100 * i)),
        *records(6, "Rock", "1975", 30, 600),
    ]
    artists.append(artist(G, 6, ["rock"]))
    loaded(tmp_path, pg, artists, listening={u: [A, *near] for u in range(1, 7)}, discogs=releases)
    assert pg_query(pg, f"SELECT mbid, rank FROM musilogy.artist_same_sound('{A}')") == [
        (n, i + 1) for i, n in enumerate(near[:8])
    ]
