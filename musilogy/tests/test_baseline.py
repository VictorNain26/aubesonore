import pytest

from musilogy import (
    REFERENCE_DISCOGRAPHY,
    REFERENCE_DUMP,
    REFERENCE_INFLUENCES,
    REFERENCE_POPULARITY,
    REFERENCE_PROXIMITY,
)
from musilogy.build import build, check_invariants, connect
from musilogy.paths import (
    SQL_DIR,
    discography_snapshot,
    influences_snapshot,
    popularity_snapshot,
    proximity_snapshot,
    work_dir,
)

# artists: 682 447 groups, orchestras and choirs, plus 1 599 244 persons. Every
# count the persons moved splits along type: restricted to the other types, the
# source breakdowns, placeable, the anomalies, the demo and live measurements and
# the count without album give back the figures they had before persons joined.
BASELINE = {
    "artists": 2_281_691,
    "albums": 1_290_584,
    "genres": 1_729,
    "links": 674_186,
    "popularity": 989_488,
    # One row per pair of MBIDs Wikidata relates by "influenced by" (P737),
    # deprecated statements left out.
    "influences": 9_517,
    # Albums and EPs whose secondary types are at most Soundtrack and Remix, one
    # row per credited artist of the population.
    "releases": 2_319_152,
    # The pages an artist page uses among those MusicBrainz relates, ended
    # ones included.
    "urls": 1_793_436,
    # The ListenBrainz neighbours of the 111 402 artists with 500 listeners or
    # more (snapshot of 2026-10-04), once the repeats and the artists given as
    # their own neighbour are dropped.
    "proximity": 4_973_236,
}
RELEASE_TYPE_BREAKDOWN = {"Album": 1_807_234, "EP": 511_918}
# Wikidata files 60 334 of the album rows and 9 465 of the EP rows as a studio
# album or an EP (discography snapshot of 2026-10-05).
RELEASES_FILED_ORIGINAL = 69_799
URLS_ENDED = 23_287
PROXIMITY_EXCLUSIONS = {"repeated_neighbour": 675, "self_neighbour": 84}
# Every artist asked, 16 515 of them without a neighbour.
PROXIMITY_SURVEYED = 111_402
DISCOGRAPHY_EXCLUSIONS = {"malformed": 1, "not_album_or_ep": 1_274, "secondary_type": 1_498}
# The influences whose two ends are artists of the dump, the only ones the
# site can name; the other 251 have an end whose MBID `artists` does not hold.
# A drift in how MBIDs are read on either side — case, whitespace — moves this
# first.
INFLUENCES_BETWEEN_ARTISTS = 9_266
# links: the relations a page shows, oriented source -> target and
# de-duplicated across the two artists that carry it. Memberships replace the
# former `members` table (601 759 rows), which read them from the band's side:
# it kept members that are not artists of this pipeline, now cut and counted,
# and published 2 397 group-in-group memberships reversed. Each count is the
# one the type had before the table kept only these five: narrowing it moved
# no row of a type kept.
LINK_TYPE_BREAKDOWN = {
    "member of band": 588_501,
    "is person": 68_334,
    "collaboration": 8_176,
    "founder": 7_328,
    "artist rename": 1_847,
}
# Of the 809 589 artist-to-artist relations of the dump: those of a life
# rather than of the music (teacher, family, touring musician, tribute…), and
# those of the five types with an end outside `artists`.
LINK_EXCLUSIONS = {"not_on_page": 109_749, "to_unextracted_artist": 25_654}
Y0_SOURCE_BREAKDOWN = {"declared": 235_246, "first_album": 346_442, None: 1_700_003}
Y_END_SOURCE_BREAKDOWN = {"declared": 147_025, "last_album": 438_801, None: 1_695_865}
# 25_band_genres.sql: the declared genres win, the albums take over.
GENRE_SOURCE_BREAKDOWN = {"declared": 199_611, "albums": 153_624, None: 1_928_456}
PLACEABLE = 581_688
# The date readings the dump loses, and the album inferences the guards of
# 30_bands_lifespan.sql refuse. Frozen here too: a guard that stops firing is
# as much a regression as a count that moves.
DATE_ANOMALIES = {
    "begin_illegible": 34,
    "end_illegible": 35,
    "begin_future": 15,
    "end_future": 11,
    "begin_below_min_year": 258,
    "end_below_min_year": 6_493,
    "end_before_begin": 3,
    "birth_illegible": 8_962,
    "birth_future": 2,
}
NEUTRALISED_INFERENCES = {
    "first_album_after_declared_end": 2_000,
    "last_album_before_declared_begin": 271,
    "first_album_with_begin_below_min_year": 73,
    "album_with_end_below_min_year": 235,
    "first_album_with_birth_below_min_year": 326,
    "first_album_before_birth": 32,
    "last_album_before_birth": 17,
}
# The measurements that argue for a rule of 20_albums.sql rather than describe
# an output: accepting Demo and excluding Live are decisions these numbers
# justify, and the README used to be their only home — where they drifted.
# (release-groups both demo and studio, of which demo first, median years earlier)
DEMO_BEFORE_STUDIO = (3_723, 2_297, 3.0)
# Artists carrying a live release dated more than 20 years after their last studio
# album: the reason a live date is not evidence of activity.
LIVE_LONG_AFTER_LAST_STUDIO = 914
BANDS_WITHOUT_ALBUM = 1_801_156
WORK = work_dir(REFERENCE_DUMP)
POPULARITY = popularity_snapshot(REFERENCE_POPULARITY)
INFLUENCES = influences_snapshot(REFERENCE_INFLUENCES)
DISCOGRAPHY = discography_snapshot(REFERENCE_DISCOGRAPHY)
PROXIMITY = proximity_snapshot(REFERENCE_PROXIMITY)


def test_the_baseline_looks_for_the_extractions_at_an_absolute_path():
    # Relative to the cwd, this suite skipped silently outside the repo root:
    # a green run that checked nothing. The skip must mean "no extraction on
    # disk", never "wrong directory".
    assert WORK.is_absolute()


def single_row(con, table):
    result = con.execute(f"SELECT * FROM {table}")
    return dict(zip([c[0] for c in result.description], result.fetchone(), strict=True))


@pytest.mark.slow
def test_reference_dump_matches_the_baseline():
    if not (WORK / "artists.jsonl").exists() or not (WORK / "release_groups.jsonl").exists():
        pytest.skip("extractions missing: run Task 3")
    if not POPULARITY.exists():
        pytest.skip(f"ListenBrainz snapshot {REFERENCE_POPULARITY} missing")
    if not INFLUENCES.exists():
        pytest.skip(f"Wikidata snapshot {REFERENCE_INFLUENCES} missing")
    if not DISCOGRAPHY.exists():
        pytest.skip(f"Wikidata snapshot {REFERENCE_DISCOGRAPHY} missing")
    if not PROXIMITY.exists():
        pytest.skip(f"ListenBrainz proximity {REFERENCE_PROXIMITY} missing")
    con = connect()
    build(
        con,
        SQL_DIR,
        WORK / "artists.jsonl",
        WORK / "release_groups.jsonl",
        None,
        popularity=POPULARITY,
        popularity_snapshot=REFERENCE_POPULARITY,
        influences=INFLUENCES,
        influences_snapshot=REFERENCE_INFLUENCES,
        discography=DISCOGRAPHY,
        discography_snapshot=REFERENCE_DISCOGRAPHY,
        proximity=PROXIMITY,
        proximity_snapshot=REFERENCE_PROXIMITY,
    )
    assert check_invariants(con, SQL_DIR) == []
    for table, expected in BASELINE.items():
        row = con.execute(f"SELECT count(*) FROM {table}").fetchone()
        assert row is not None
        got = row[0]
        assert got == expected, f"{table}: expected {expected}, got {got}"

    for column, expected_breakdown in (
        ("y0_source", Y0_SOURCE_BREAKDOWN),
        ("y_end_source", Y_END_SOURCE_BREAKDOWN),
        ("genre_source", GENRE_SOURCE_BREAKDOWN),
    ):
        got_breakdown = dict(
            con.execute(f"SELECT {column}, count(*) FROM artists GROUP BY {column}").fetchall()
        )
        assert got_breakdown == expected_breakdown, column

    row = con.execute("SELECT count(*) FROM artists WHERE y0 IS NOT NULL").fetchone()
    assert row is not None
    assert row[0] == PLACEABLE

    row = con.execute(
        "SELECT count(*) FROM influences i "
        "WHERE EXISTS (SELECT 1 FROM artists a WHERE a.mbid = i.artist_mbid) "
        "AND EXISTS (SELECT 1 FROM artists a WHERE a.mbid = i.influence_mbid)"
    ).fetchone()
    assert row is not None
    assert row[0] == INFLUENCES_BETWEEN_ARTISTS

    assert single_row(con, "r2_anomalies") == DATE_ANOMALIES
    assert single_row(con, "neutralised_inferences") == NEUTRALISED_INFERENCES
    assert single_row(con, "link_exclusions") == LINK_EXCLUSIONS
    assert single_row(con, "discography_exclusions") == DISCOGRAPHY_EXCLUSIONS
    assert con.execute("SELECT count(*) FROM releases WHERE filed_original").fetchone() == (
        RELEASES_FILED_ORIGINAL,
    )
    assert dict(con.execute("SELECT type, count(*) FROM links GROUP BY type").fetchall()) == (
        LINK_TYPE_BREAKDOWN
    )
    assert (
        dict(con.execute("SELECT primary_type, count(*) FROM releases GROUP BY 1").fetchall())
        == RELEASE_TYPE_BREAKDOWN
    )
    assert con.execute("SELECT count(*) FROM urls WHERE ended").fetchone() == (URLS_ENDED,)
    assert single_row(con, "proximity_exclusions") == PROXIMITY_EXCLUSIONS
    assert con.execute("SELECT count(*) FROM artists WHERE proximity_surveyed").fetchone() == (
        PROXIMITY_SURVEYED,
    )

    row = con.execute(
        "SELECT count(*) FROM artists WHERE y_end IS NOT NULL AND y0 IS NOT NULL AND y_end < y0"
    ).fetchone()
    assert row is not None
    assert row[0] == 0

    row = con.execute(
        """
        WITH cred AS (
          SELECT list_distinct(artists)[1] AS artist_mbid, yr(date) AS y,
                 coalesce(secondary, []) AS sec
          FROM raw_release_groups
          WHERE primary_type = 'Album'
            AND len(list_distinct(artists)) = 1
            AND yr(date) BETWEEN 1850 AND 2026
        ),
        pairs AS (
          SELECT c.artist_mbid,
                 min(c.y) FILTER (WHERE list_contains(c.sec, 'Demo')) AS y_demo,
                 min(c.y) FILTER (WHERE len(c.sec) = 0) AS y_studio
          FROM cred c JOIN artists b ON b.mbid = c.artist_mbid
          GROUP BY c.artist_mbid
          HAVING y_demo IS NOT NULL AND y_studio IS NOT NULL
        )
        SELECT count(*), count(*) FILTER (WHERE y_demo < y_studio),
               median(y_studio - y_demo) FILTER (WHERE y_demo < y_studio)
        FROM pairs
        """
    ).fetchone()
    assert row == DEMO_BEFORE_STUDIO

    row = con.execute(
        """
        SELECT count(DISTINCT l.artist_mbid) FROM (
          SELECT list_distinct(artists)[1] AS artist_mbid, yr(date) AS y
          FROM raw_release_groups
          WHERE primary_type = 'Album'
            AND list_contains(coalesce(secondary, []), 'Live')
            AND len(list_distinct(artists)) = 1
            AND yr(date) IS NOT NULL
            AND yr(date) BETWEEN 1850 AND 2026
        ) l JOIN artists b ON b.mbid = l.artist_mbid
        WHERE b.y_last_album IS NOT NULL AND l.y - b.y_last_album > 20
        """
    ).fetchone()
    assert row is not None
    assert row[0] == LIVE_LONG_AFTER_LAST_STUDIO

    row = con.execute(
        "SELECT count(*) FROM artists b WHERE NOT EXISTS "
        "(SELECT 1 FROM albums a WHERE a.artist_mbid = b.mbid)"
    ).fetchone()
    assert row is not None
    assert row[0] == BANDS_WITHOUT_ALBUM
