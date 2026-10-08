import json
from collections import defaultdict

from conftest import (
    FIX,
    build_synthetic,
    discogs_file,
    discogs_release,
    discogs_url,
    synthetic_artist,
)
from test_invariants import restored

from musilogy.build import check_invariants
from musilogy.paths import SQL_DIR

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
    assert check_invariants(c, SQL_DIR) == []
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


def test_compilations_unofficial_releases_and_promos_do_not_count(tmp_path):
    c = built(
        tmp_path,
        [linked(A, 1)],
        [
            discogs_release(1, [1], descriptions=["Compilation"], styles=["House"]),
            discogs_release(2, [1], descriptions=["Unofficial Release", "LP"], styles=["House"]),
            discogs_release(3, [1], descriptions=["Promo"], styles=["House"]),
            discogs_release(4, [1], descriptions=["Album", "LP"], styles=["Techno"]),
        ],
    )
    assert styles(c) == [(A, 2000, "Techno", 1)]
    assert c.execute("SELECT releases, releases_out_of_work FROM discogs_coverage").fetchone() == (
        4,
        3,
    )


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


def test_a_build_without_discogs_has_no_style(tmp_path):
    c = build_synthetic(tmp_path, [linked(A, 1)])
    assert c.execute("SELECT count(*) FROM styles").fetchone() == (0,)


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


JOY_DIVISION = "9a58fda3-f4ed-4080-a3a5-f457aac9fcdd"
NEW_ORDER = "f1106b17-dcbb-45f6-b938-199ccfab50cc"
OUT_OF_WORK = {
    "Compilation",
    "Unofficial Release",
    "Partially Unofficial",
    "Promo",
    "Sampler",
    "Mixed",
    "Mixtape",
    "Partially Mixed",
}


def recount_styles(discogs_ids):
    """The styles rule restated in Python over the fixture lines, for one artist:
    a record is the artist's when one of its editions credits it, and carries the
    styles and the first year of all its editions."""
    first_year: dict[str, int | None] = {}
    record_styles = defaultdict(set)
    own = set()
    with (FIX / "discogs.jsonl").open(encoding="utf-8") as fh:
        for line in fh:
            r = json.loads(line)
            if OUT_OF_WORK & set(r["descriptions"]):
                continue
            record = f"m{r['master_id']}" if r["master_id"] else f"r{r['id']}"
            y = int(r["released"][:4]) if (r["released"] or "")[:4].isdigit() else None
            y = y if y and 1850 <= y <= 2026 else None
            earliest = first_year.get(record)
            if y is not None and (earliest is None or y < earliest):
                first_year[record] = y
            first_year.setdefault(record, None)
            record_styles[record].update(r["styles"])
            if discogs_ids & set(r["artists"]):
                own.add(record)
    records = defaultdict(set)
    for record in own:
        y = first_year[record]
        for style in record_styles[record]:
            records[(None if y is None else y // 10 * 10, style)].add(record)
    return {key: len(rs) for key, rs in records.items()}


def discogs_ids_of(con, mbid):
    return {
        r[0]
        for r in con.execute(
            "SELECT discogs_id FROM discogs_links WHERE mbid = ?", [mbid]
        ).fetchall()
    }


def test_the_witnesses_styles_match_a_recount_of_the_fixture(con):
    for mbid in (JOY_DIVISION, NEW_ORDER):
        got = {
            (decade, style): records
            for decade, style, records in con.execute(
                "SELECT decade, style, records FROM styles WHERE artist_mbid = ?", [mbid]
            ).fetchall()
        }
        assert got, mbid
        assert got == recount_styles(discogs_ids_of(con, mbid)), mbid


def test_a_style_reached_through_no_discogs_page_of_its_own_is_reported(con):
    # An artist that relates no Discogs page can only carry a style through an
    # id another MBID holds.
    (pageless,) = con.execute(
        "SELECT a.mbid FROM artists a JOIN raw_artists r USING (mbid) "
        "WHERE NOT list_contains([u.type FOR u IN r.urls], 'discogs') ORDER BY a.mbid LIMIT 1"
    ).fetchone()
    row = con.execute(
        "SELECT decade, style, records FROM styles WHERE artist_mbid = ? LIMIT 1",
        [JOY_DIVISION],
    ).fetchone()
    undo = "DELETE FROM styles WHERE artist_mbid = ?"
    with restored(con, (undo, [pageless])):
        con.execute("INSERT INTO styles VALUES (?, ?, ?, ?)", [pageless, *row])
        violations = dict(check_invariants(con, SQL_DIR))
    assert violations.get("discogs_link_ambiguous") == 1
