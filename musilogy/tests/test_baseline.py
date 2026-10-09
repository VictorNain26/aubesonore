import pytest

from musilogy import (
    REFERENCE_DISCOGRAPHY,
    REFERENCE_DISCOGS,
    REFERENCE_DUMP,
    REFERENCE_OFFICIAL,
    REFERENCE_POPULARITY,
)
from musilogy.build import build, check_invariants, connect
from musilogy.paths import (
    SQL_DIR,
    discography_snapshot,
    discogs_releases,
    official_snapshot,
    popularity_snapshot,
    work_dir,
)

# artists: 682 447 groups, orchestras and choirs, 1 599 244 persons, and 698 602
# artists without a type (674 240), characters (17 790) and others (6 572).
# Restricted to the first two, the source breakdowns, placeable, the anomalies,
# the demo and live measurements, the count without album and popularity give
# back the figures they had before the other types joined.
BASELINE = {
    "artists": 2_980_293,
    "albums": 1_419_423,
    "genres": 1_740,
    "links": 701_614,
    "popularity": 1_366_777,
    # Albums and EPs whose secondary types are at most Soundtrack and Remix, one
    # row per credited artist of the population.
    "releases": 2_556_274,
    # The pages an artist page uses among those MusicBrainz relates, ended
    # ones included: 44 848 Wikipedia and image pages left out since no page
    # reads them.
    "urls": 1_991_446,
    # The styles of an artist by decade, over the artists Discogs is linked to.
    "styles": 4_359_024,
}
RELEASE_TYPE_BREAKDOWN = {"Album": 1_968_255, "EP": 588_019}
# Wikidata files 60 688 of the album rows and 9 508 of the EP rows as a studio
# album or an EP (discography snapshot of 2026-10-05).
RELEASES_FILED_ORIGINAL = 70_196
URLS_ENDED = 24_671
DISCOGS_COVERAGE = {
    "releases": 19_492_392,
    "releases_out_of_work": 4_234_631,
    "records": 8_634_459,
    "discogs_ids_ambiguous": 352,
    "artists_linked": 1_266_088,
}
DISCOGS_DATE_DISAGREEMENTS = {"first_record_before_formation": 1_748}
# Distinct records by official status (part of 2026-10-05: 93 665 artists asked,
# 2 of them no longer held; part of 2026-10-06: the 9 062 artists with only EPs
# or of the other types, which move 22 504 records out of unknown). Unknown
# dominates: only artists with 500 listeners or more and a release are asked.
RELEASE_STATUS = {"official": 763_457, "not_official": 12_132, "unknown": 1_411_793}
DISCOGRAPHY_EXCLUSIONS = {"malformed": 1, "not_album_or_ep": 1_274, "secondary_type": 1_498}
# links: the relations a page shows, oriented source -> target and
# de-duplicated across the two artists that carry it. Memberships replace the
# former `members` table (601 759 rows), which read them from the band's side:
# it kept members that are not artists of this pipeline, now cut and counted,
# and published 2 397 group-in-group memberships reversed. Each count is the
# one the type had before the table kept only these five, plus the links the
# artists without a type, characters and others brought.
LINK_TYPE_BREAKDOWN = {
    "member of band": 607_195,
    "is person": 75_222,
    "collaboration": 9_257,
    "founder": 7_915,
    "artist rename": 2_025,
}
# Of the 811 844 artist-to-artist relations of the dump: those of a life
# rather than of the music (teacher, family, touring musician, tribute…), and
# those of the five types with an end outside `artists`.
LINK_EXCLUSIONS = {"not_on_page": 110_205, "to_unextracted_artist": 25}
Y0_SOURCE_BREAKDOWN = {"declared": 235_246, "first_album": 420_208, None: 2_324_839}
Y_END_SOURCE_BREAKDOWN = {"declared": 148_933, "last_album": 512_131, None: 2_319_229}
# 25_band_genres.sql: the declared genres win, the albums take over.
GENRE_SOURCE_BREAKDOWN = {"declared": 211_764, "albums": 176_210, None: 2_592_319}
PLACEABLE = 655_454
# The date readings the dump loses, and the album inferences the guards of
# 30_bands_lifespan.sql refuse. Frozen here too: a guard that stops firing is
# as much a regression as a count that moves.
DATE_ANOMALIES = {
    "begin_illegible": 34,
    "end_illegible": 39,
    "begin_future": 15,
    "end_future": 14,
    "begin_below_min_year": 258,
    "end_below_min_year": 6_526,
    "end_before_begin": 3,
    "birth_illegible": 8_962,
    "birth_future": 2,
    "begin_ambiguous": 13_277,
}
NEUTRALISED_INFERENCES = {
    "first_album_after_declared_end": 2_039,
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
DEMO_BEFORE_STUDIO = (3_894, 2_402, 3.0)
# Artists carrying a live release dated more than 20 years after their last studio
# album: the reason a live date is not evidence of activity.
LIVE_LONG_AFTER_LAST_STUDIO = 925
BANDS_WITHOUT_ALBUM = 2_425_953
WORK = work_dir(REFERENCE_DUMP)
POPULARITY = popularity_snapshot(REFERENCE_POPULARITY)
DISCOGRAPHY = discography_snapshot(REFERENCE_DISCOGRAPHY)
OFFICIAL = [official_snapshot(date) for date in REFERENCE_OFFICIAL]
DISCOGS = discogs_releases(REFERENCE_DISCOGS)


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
    inputs = {
        "MusicBrainz extractions": [WORK / "artists.jsonl", WORK / "release_groups.jsonl"],
        f"ListenBrainz snapshot {REFERENCE_POPULARITY}": [POPULARITY],
        f"Wikidata snapshot {REFERENCE_DISCOGRAPHY}": [DISCOGRAPHY],
        f"MusicBrainz official status {REFERENCE_OFFICIAL}": OFFICIAL,
        f"Discogs extraction {REFERENCE_DISCOGS}": [DISCOGS],
    }
    for name, paths in inputs.items():
        if not all(path.exists() for path in paths):
            pytest.skip(f"{name} missing")
    con = connect()
    build(
        con,
        SQL_DIR,
        WORK / "artists.jsonl",
        WORK / "release_groups.jsonl",
        None,
        popularity=POPULARITY,
        popularity_snapshot=REFERENCE_POPULARITY,
        discography=DISCOGRAPHY,
        discography_snapshot=REFERENCE_DISCOGRAPHY,
        official=OFFICIAL,
        official_snapshots=REFERENCE_OFFICIAL,
        discogs=DISCOGS,
        discogs_dump=REFERENCE_DISCOGS,
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
    assert single_row(con, "release_status") == RELEASE_STATUS
    assert single_row(con, "discogs_coverage") == DISCOGS_COVERAGE
    assert single_row(con, "discogs_date_disagreements") == DISCOGS_DATE_DISAGREEMENTS

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
