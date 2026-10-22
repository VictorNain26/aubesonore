import json
import re
import subprocess

import pytest

from musilogy import REFERENCE_DUMP as DUMP
from musilogy import REFERENCE_POPULARITY
from musilogy.colisten import PARAMETERS as COLISTEN_PARAMETERS
from musilogy.fetch import expected_sums, sha256_file
from musilogy.paths import PACKAGE_DIR, SQL_DIR, dump_sums, extraction_sidecar, popularity_sums
from musilogy.publish import (
    COUNTER_TABLES,
    PARAMETERS,
    TABLES,
    Comparison,
    Drift,
    Trace,
    accepts,
    compare,
    compared,
    delivered,
    group_of,
    previous_manifest,
    publish,
)
from tests.conftest import (
    build_synthetic,
    delivery_manifest,
    official_file,
    synthetic_artist,
    synthetic_release_group,
)

REF_SUMS = dump_sums(DUMP)


def test_publish_writes_every_table(con, tmp_path):
    manifest = publish(con, tmp_path, DUMP)
    for name in ("artists", "albums", "links", "popularity", "same_sound"):
        assert (tmp_path / f"{name}.parquet").exists()
        assert name in manifest["counts"]
    assert manifest["dump"] == DUMP
    assert "genre_parents" not in manifest["counts"]


def test_publish_removes_every_file_it_did_not_write(con, tmp_path):
    # Deliveries published before the web exports were retired still hold a
    # web/ directory: it must leave the delivery, not be digested into it.
    retired = tmp_path / "web" / "artists_timeline.json.gz"
    retired.parent.mkdir(parents=True)
    retired.write_bytes(b"retired export")
    manifest = publish(con, tmp_path, DUMP)
    assert not retired.exists()
    assert not any(name.startswith("web/") for name in manifest["output_sha256"])


def test_publish_removes_a_parquet_it_no_longer_writes(con, tmp_path):
    stale = tmp_path / "genre_parents.parquet"
    stale.write_bytes(b"not a parquet, and it must not survive anyway")
    manifest = publish(con, tmp_path, DUMP)
    assert not stale.exists()
    assert "genre_parents" not in manifest["counts"]
    assert (tmp_path / "artists.parquet").exists()


def test_manifest_carries_archive_checksums(con, tmp_path):
    manifest = publish(con, tmp_path, DUMP)
    assert manifest["archive_sha256"] == expected_sums(REF_SUMS)


def test_manifest_names_the_popularity_snapshot_the_build_loaded(con, tmp_path):
    manifest = publish(con, tmp_path, DUMP)
    assert manifest["popularity"] == {
        "snapshot": REFERENCE_POPULARITY,
        "sha256": expected_sums(popularity_sums(REFERENCE_POPULARITY)),
    }


def test_manifest_names_the_official_parts_and_counts_the_statuses(tmp_path, monkeypatch):
    def sums(date):
        path = tmp_path / f"musicbrainz-official-{date}.SHA256SUMS"
        path.write_text(f"{'5' * 64}  official-release-groups.jsonl\n", encoding="utf-8")
        return path

    monkeypatch.setattr("musilogy.publish.official_sums", sums)
    con = build_synthetic(
        tmp_path,
        [synthetic_artist("a", "1990", None)],
        [synthetic_release_group(m, "a", "1991") for m in ("rg-1", "rg-2")],
        official=[official_file(tmp_path / "o.jsonl", {"a": ["rg-1"]})],
        official_snapshots=["2026-10-05"],
    )
    manifest = publish(con, tmp_path / "out", DUMP)
    assert manifest["official"] == [
        {"snapshot": "2026-10-05", "sha256": {"official-release-groups.jsonl": "5" * 64}}
    ]
    assert manifest["release_status"] == {"official": 1, "not_official": 1, "unknown": 0}


def test_a_build_without_snapshot_says_so_in_the_manifest(tmp_path):
    con = build_synthetic(tmp_path, [synthetic_artist("a", "1990", None)])
    manifest = publish(con, tmp_path / "out", DUMP)
    assert manifest["popularity"] is None
    assert manifest["official"] is None


def test_manifest_carries_r2_anomaly_counters(con, tmp_path):
    manifest = publish(con, tmp_path, DUMP)
    assert manifest["r2_anomalies"] == {
        "begin_illegible": 1,
        "end_illegible": 1,
        "begin_future": 1,
        "end_future": 1,
        # The artists linked to the witnesses count too: Bach's circle, dead
        # before 1850, brings most of the ends. Births never count here: a
        # person's begin is not read as a formation.
        "begin_below_min_year": 3,
        "end_below_min_year": 22,
        "end_before_begin": 1,
        "birth_illegible": 0,
        "birth_future": 0,
        "begin_ambiguous": 8,
    }


def test_manifest_carries_the_seven_neutralised_inference_counters(con, tmp_path):
    # One counter per guard of 30_bands_lifespan.sql. On the witnesses:
    # Polska Radio One (formed 2015, last album 2014) for the end, Wiener
    # Philharmoniker and Handel and Haydn Society (begins below 1850) for the
    # begin, Bach (dead in 1750, recorded from 1961) for an end below 1850. A
    # neutralised anomaly stays visible instead of being absorbed.
    manifest = publish(con, tmp_path, DUMP)
    assert manifest["neutralised_inferences"] == {
        "first_album_after_declared_end": 0,
        "last_album_before_declared_begin": 1,
        "first_album_with_begin_below_min_year": 2,
        "album_with_end_below_min_year": 1,
        # Bach again: born in 1685, as well as dead before 1850.
        "first_album_with_birth_below_min_year": 1,
        "first_album_before_birth": 0,
        "last_album_before_birth": 0,
    }


def test_manifest_carries_git_sha(con, tmp_path):
    manifest = publish(con, tmp_path, DUMP)
    expected = subprocess.run(
        ["git", "rev-parse", "HEAD"],
        capture_output=True,
        text=True,
        check=True,
        cwd=PACKAGE_DIR,
    ).stdout.strip()
    assert manifest["git_sha"] == expected


def test_r2_anomaly_counters_are_not_mismapped_between_subrules(tmp_path):
    # Deliberately distinct counts per sub-rule: on the shared fixtures,
    # several counters hold the same value, and a key swap (begin_future <->
    # end_future, begin_below_min_year <-> end_below_min_year, for example)
    # would otherwise go unnoticed.
    records = (
        [synthetic_artist(f"begin-illegible-{i}", "????-01-01", None) for i in range(2)]
        + [synthetic_artist(f"end-illegible-{i}", "2000-01-01", "????-06") for i in range(3)]
        + [synthetic_artist(f"begin-future-{i}", "2090-01-01", None) for i in range(4)]
        + [synthetic_artist(f"end-future-{i}", "2000-01-01", "2090-01-01") for i in range(5)]
        + [synthetic_artist(f"end-before-begin-{i}", "2010-01-01", "2005-01-01") for i in range(6)]
        + [synthetic_artist(f"begin-below-min-{i}", "0742", None) for i in range(7)]
        + [synthetic_artist(f"end-below-min-{i}", None, "1700-01-01") for i in range(8)]
        + [
            synthetic_artist(f"birth-illegible-{i}", "????-03-01", None, kind="Person")
            for i in range(9)
        ]
        + [synthetic_artist(f"birth-future-{i}", "2090", None, kind="Person") for i in range(10)]
        # A person's begin never feeds the begin counters: these must stay out
        # of begin_illegible, begin_future and begin_below_min_year.
        + [synthetic_artist(f"birth-early-{i}", "1685", None, kind="Person") for i in range(11)]
        # A begin that may be a birth is counted apart, and in no begin counter.
        + [synthetic_artist(f"ambiguous-{i}", "2090", None, kind=None) for i in range(12)]
    )
    c = build_synthetic(tmp_path, records)
    manifest = publish(c, tmp_path / "out", DUMP)

    assert manifest["r2_anomalies"] == {
        "begin_illegible": 2,
        "end_illegible": 3,
        "begin_future": 4,
        "end_future": 5,
        "begin_below_min_year": 7,
        "end_below_min_year": 8,
        "end_before_begin": 6,
        "birth_illegible": 9,
        "birth_future": 10,
        "begin_ambiguous": 12,
    }


def test_parquet_archives_are_zstd_compressed(con, tmp_path):
    publish(con, tmp_path, DUMP)
    parquet_path = (tmp_path / "artists.parquet").as_posix()
    codecs = con.execute(
        f"SELECT DISTINCT compression FROM parquet_metadata('{parquet_path}')"
    ).fetchall()
    assert codecs == [("ZSTD",)]


def test_manifest_carries_the_parameters_the_build_actually_used(tmp_path):
    # Two runs with different bounds produced indistinguishable manifests: a
    # published dataset was not replayable from its own artifacts. Read back
    # from the connection, never from the caller, so the manifest reports what
    # the build used rather than what the caller meant to set.
    c = build_synthetic(
        tmp_path, [synthetic_artist("a", "1990", None)], dump_year=2030, min_year=1900
    )
    manifest = publish(c, tmp_path / "out", DUMP)
    assert manifest["parameters"] == {
        "dump_year": 2030,
        "min_year": 1900,
        **COLISTEN_PARAMETERS,
        "same_sound_min_style_records": 3,
        "same_sound_shrink": 10,
        "same_sound_k": 8,
        "credits_max_artists": 10,
    }


def test_manifest_counts_the_rows_that_fed_the_build(con, tmp_path):
    manifest = publish(con, tmp_path, DUMP)
    loaded = manifest["inputs"]["rows_loaded"]
    assert loaded["raw_artists"] == con.execute("SELECT count(*) FROM raw_artists").fetchone()[0]
    assert (
        loaded["raw_release_groups"]
        == con.execute("SELECT count(*) FROM raw_release_groups").fetchone()[0]
    )


def test_manifest_replays_the_extraction_counts_beside_the_rows_loaded(con, tmp_path):
    # The point of recording them: a truncated extraction — a full disk — makes
    # the build silently smaller, and nothing else in the manifest would show
    # it. Published side by side, kept-at-extraction against rows-loaded, the
    # discrepancy is readable.
    sidecar = tmp_path / "extraction.json"
    sidecar.write_text(
        json.dumps(
            {
                "artists_kept": 7,
                "artists_dropped": 3,
                "release_groups_kept": 5,
                "release_groups_dropped": 11,
            }
        ),
        encoding="utf-8",
    )
    manifest = publish(con, tmp_path / "out", DUMP, sidecar)
    assert manifest["inputs"]["extraction"]["artists_kept"] == 7
    assert manifest["inputs"]["extraction"]["release_groups_dropped"] == 11


AGREEING = {"artists_kept": 694, "release_groups_kept": 10613}
SHORT = {"artists_kept": 28, "release_groups_kept": 3627}
UNREADABLE = {"unreadable": True}


# What the manifest says of the extraction sidecar: its record, and whether it
# agrees with the rows the build loaded. Three states, never two: "no record"
# (None) is not "mismatch" (False), and a sidecar that is absent, unreadable or
# missing a count says nothing about the extraction.
@pytest.mark.parametrize(
    ("sidecar", "extraction", "matches"),
    [
        # The synthetic builds have no extraction step at all. Null is the
        # honest answer; an absent key would let a reader assume nothing was
        # dropped.
        pytest.param(None, None, None, id="no-sidecar"),
        pytest.param("missing", None, None, id="path-missing"),
        # The "full disk during extraction" case: a bare json.loads used to
        # take the whole manifest down, counts and parameters with it.
        pytest.param(b'{"artists_kept": 7', UNREADABLE, None, id="truncated"),
        # Parses without error, then would flow into the manifest as a shape
        # no reader expects.
        pytest.param(b"[1, 2, 3]", UNREADABLE, None, id="not-an-object"),
        # A cut inside a multi-byte character fails at decode, before
        # json.loads runs: fails if the except clause is narrowed back to
        # json.JSONDecodeError alone.
        pytest.param('{"name": "Motörhead"}'.encode()[:14], UNREADABLE, None, id="mid-character"),
        # What the fixtures load (test_manifest_counts_the_rows_that_fed_the_build):
        # the case the discrepancy check must let through.
        pytest.param(json.dumps(AGREEING).encode(), AGREEING, True, id="counts-agree"),
        # Fewer release groups reached the disk than the extraction kept: the
        # boolean goes False rather than leave a human to subtract by hand.
        pytest.param(json.dumps(SHORT).encode(), SHORT, False, id="counts-disagree"),
        pytest.param(b'{"artists_kept": 28}', {"artists_kept": 28}, None, id="count-missing"),
    ],
)
def test_manifest_reports_the_extraction_sidecar(con, tmp_path, sidecar, extraction, matches):
    path = None if sidecar is None else extraction_sidecar(tmp_path)
    if isinstance(sidecar, bytes):
        assert path is not None
        path.write_bytes(sidecar)
    manifest = publish(con, tmp_path / "out", DUMP, path)
    assert manifest["counts"]
    assert manifest["inputs"]["extraction"] == extraction
    assert manifest["inputs"]["extraction_matches_rows_loaded"] is matches


# A delivery is reproducible only if its rows come out in a fixed order: same
# code and same extraction must give the same bytes, or no consumer can cache
# by digest and no two dumps can be diffed. The engine builds these tables with
# parallel joins and aggregates, so insertion order is whatever the threads
# produced — publishing has to impose the order itself.
PARQUET_KEYS = {
    "artists": ["mbid"],
    "albums": ["rg_mbid"],
    "links": ["src_mbid", "dst_mbid", "type", "y_begin", "y_end"],
}


def nulls_last(row):
    """links' key carries NULL years on many of its rows, so the test
    has to state where NULLs sort — Python refuses to compare None to an int,
    and DuckDB's placement is a session setting rather than a property of the
    query."""
    return tuple((value is None, value) for value in row)


@pytest.mark.parametrize("table", sorted(PARQUET_KEYS))
def test_published_parquet_rows_are_ordered_by_their_key(con, tmp_path, table):
    publish(con, tmp_path, DUMP)
    columns = ", ".join(PARQUET_KEYS[table])
    path = (tmp_path / f"{table}.parquet").as_posix()
    rows = con.execute(f"SELECT {columns} FROM read_parquet('{path}')").fetchall()
    assert rows == sorted(rows, key=nulls_last)


def test_manifest_carries_the_digest_of_every_delivered_file(con, tmp_path):
    # The delivery is byte-reproducible, which is only useful if the digests
    # travel with it: without them a consumer cannot tell a truncated download
    # from a complete one, nor an unchanged export from a new one, and the
    # reproducibility cannot be checked by anyone but the producer. Compared as
    # sets, so a file pruned from a previous schema cannot linger in the
    # manifest either.
    manifest = publish(con, tmp_path, DUMP)
    delivered = {
        path.relative_to(tmp_path).as_posix()
        for path in tmp_path.rglob("*")
        if path.is_file() and path.name != "manifest.json"
    }
    assert set(manifest["output_sha256"]) == delivered
    for name, digest in manifest["output_sha256"].items():
        assert digest == sha256_file(tmp_path / name)


def test_the_manifest_names_every_parameter_the_sql_sets():
    # Case this must catch: a SET VARIABLE added to a rule without its name in
    # PARAMETERS. The manifest reads back only the names listed, so the new
    # bound would shape the delivery without being stated.
    sets = {
        name
        for path in SQL_DIR.glob("*.sql")
        for name in re.findall(
            r"^\s*SET\s+VARIABLE\s+(\w+)",
            path.read_text(encoding="utf-8"),
            re.MULTILINE | re.IGNORECASE,
        )
    }
    assert sets
    assert sets <= set(PARAMETERS)


# The data diff: a delivery's counts and counters against the previous
# delivery's. The case each test below must catch is named in it.


@pytest.mark.parametrize(
    ("got", "moved"),
    [
        # At the limit, in either direction: a comparison written `>=` instead
        # of `>` stops these.
        pytest.param(1010, False, id="grown-to-the-limit"),
        pytest.param(990, False, id="shrunk-to-the-limit"),
        # One row past it, in either direction: a comparison of the signed
        # delta rather than its size lets the shrink through.
        pytest.param(1011, True, id="grown-past-the-limit"),
        pytest.param(989, True, id="shrunk-past-the-limit"),
    ],
)
@pytest.mark.parametrize("name", ["artists", "link_exclusions.not_on_page"])
def test_a_count_drifts_once_it_moves_past_the_limit(name, got, moved):
    # A counter is held to the same limit as a table.
    found = compare({name: 1000}, {name: got}, limit=0.01)
    assert found == Comparison([Drift(name, 1000, got)] if moved else [], {}, {})


def test_every_count_that_moved_is_named_and_only_those():
    expected = {"artists": 1000, "links": 500, "urls": 200, "release_status.unknown": 40}
    got = {"artists": 2000, "links": 500, "urls": 100, "release_status.unknown": 80}
    assert compare(expected, got, limit=0.01).drifts == [
        Drift("artists", 1000, 2000),
        Drift("urls", 200, 100),
        Drift("release_status.unknown", 40, 80),
    ]


def test_a_drift_states_its_absolute_and_relative_move():
    # The urls of 10bcad46: the Wikipedia and image pages leaving the table.
    drift = Drift("urls", 2_036_294, 1_991_446)
    assert drift.absolute == -44_848
    assert drift.relative == pytest.approx(-0.022024, abs=1e-6)
    assert str(drift) == "urls: expected 2036294, got 1991446, -44848 (-2.20%)"


def test_a_table_the_previous_delivery_did_not_have_drifts():
    # A table added to the delivery moves from nothing: its rows were never
    # compared to anything, so it cannot pass as unchanged.
    assert compare({}, {"styles": 3}, limit=0.5) == Comparison([Drift("styles", 0, 3)], {}, {})
    assert Drift("styles", 0, 3).relative == float("inf")
    assert compare({}, {"styles": 0}, limit=0.5) == Comparison([], {}, {})


def test_a_table_the_delivery_no_longer_has_is_not_a_drift():
    # publish() removes a retired table's file; its old count says nothing of
    # the tables delivered now.
    found = compare({"genres": 1740, "artists": 10}, {"artists": 10}, limit=0.01)
    assert found == Comparison([], {}, {})


def test_a_counter_the_previous_delivery_did_not_have_is_new_not_a_drift():
    # A counter added to the SQL since has nothing to be compared with: it is
    # said, and the run goes on. Case: it read as moving from zero, and every
    # counter added stops the next run.
    found = compare({"artists": 10}, {"artists": 10, "r2_anomalies.birth_future": 4}, limit=0.01)
    assert found == Comparison([], {"r2_anomalies.birth_future": 4}, {})


def test_a_counter_the_delivery_no_longer_has_is_gone_not_a_drift():
    # Case: a counter dropped from the SQL, or renamed, passing unnoticed.
    found = compare({"artists": 10, "r2_anomalies.birth_future": 4}, {"artists": 10}, limit=0.01)
    assert found == Comparison([], {}, {"r2_anomalies.birth_future": 4})


def test_the_counts_compared_are_those_publish_writes(con, tmp_path):
    # Case: the comparison counting other tables or counters, or otherwise,
    # than the manifest it is compared with — a delivery would then drift
    # from itself.
    manifest = publish(con, tmp_path, DUMP)
    assert delivered(con) == compared(manifest)
    assert compare(compared(manifest), delivered(con)) == Comparison([], {}, {})


def test_every_counter_of_the_manifest_is_compared(con, tmp_path):
    # Case: a counter group written to the manifest but left out of the
    # comparison. Each group's counters are named after their group, so that
    # two groups counting under the same name cannot be mistaken.
    manifest = publish(con, tmp_path, DUMP)
    names = set(compared(manifest))
    assert names >= set(manifest["counts"])
    for group in COUNTER_TABLES:
        assert manifest[group], group
        assert {f"{group}.{counter}" for counter in manifest[group]} <= names
    assert len(names) == len(manifest["counts"]) + sum(len(manifest[g]) for g in COUNTER_TABLES)


def test_a_manifest_older_than_a_counter_group_compares_its_counts_alone():
    # Case: a delivery predating a group taken for a broken one.
    assert compared({"counts": {"artists": 3}}) == {"artists": 3}


@pytest.mark.parametrize("trace", [None, Trace([], {}, {})])
def test_a_delivery_that_moved_nothing_carries_no_trace(con, tmp_path, trace):
    manifest = publish(con, tmp_path, DUMP, None, trace)
    assert not {"accepted_drifts", "new_counters", "gone_counters"} & set(manifest)


def test_the_accepted_drifts_stay_with_the_delivery(con, tmp_path):
    # Case: the run told to let a move through, and the delivery then holding
    # no trace of it — the next reader takes the new counts for unchallenged.
    accepted = [Drift("urls", 200, 100), Drift("link_exclusions.not_on_page", 10, 30)]
    publish(con, tmp_path, DUMP, None, Trace(accepted, {}, {}))
    written = json.loads((tmp_path / "manifest.json").read_text(encoding="utf-8"))
    assert written["accepted_drifts"] == [
        {"name": "urls", "expected": 200, "got": 100},
        {"name": "link_exclusions.not_on_page", "expected": 10, "got": 30},
    ]
    assert not {"new_counters", "gone_counters"} & set(written)


def test_the_counters_new_and_gone_stay_with_the_delivery(con, tmp_path):
    # Case: a counter added or dropped since said once, on the run's output,
    # and the delivery then holding no trace of it — the next run compares
    # the new counter as if it had always been there, the dropped one is
    # forgotten.
    trace = Trace(
        [],
        {"r2_anomalies.birth_future": 4, "release_status.withdrawn": 0},
        {"r2_anomalies.begin_retired": 7},
    )
    publish(con, tmp_path, DUMP, None, trace)
    written = json.loads((tmp_path / "manifest.json").read_text(encoding="utf-8"))
    assert written["new_counters"] == [
        {"name": "r2_anomalies.birth_future", "got": 4},
        {"name": "release_status.withdrawn", "got": 0},
    ]
    assert written["gone_counters"] == [{"name": "r2_anomalies.begin_retired", "expected": 7}]
    assert "accepted_drifts" not in written


def test_no_table_is_named_like_a_counter_group():
    # --accept-drift takes a table or a counter group under the same bare
    # name. Case: a table added under a group's name, or the reverse, and
    # accepting one then accepting the other.
    assert not set(TABLES) & set(COUNTER_TABLES)


def test_the_previous_delivery_of_the_same_dump_is_the_one_it_replaces(tmp_path):
    # Case: reading a sibling while the run is about to overwrite this one.
    same = delivery_manifest(tmp_path / "20260909-001002", {"artists": 1})
    delivery_manifest(tmp_path / "20261007-001001", {"artists": 2})
    assert previous_manifest(tmp_path / "20260909-001002") == (same, {"counts": {"artists": 1}})


def test_a_new_dump_is_compared_with_the_latest_dump_delivered(tmp_path):
    # Dump names are their timestamps: sorted, the last is the latest. Case:
    # taking the first, or any directory without a manifest.
    delivery_manifest(tmp_path / "20260813-001001", {"artists": 1})
    latest = delivery_manifest(tmp_path / "20260909-001002", {"artists": 2})
    (tmp_path / "20260910-001001").mkdir()
    assert previous_manifest(tmp_path / "20261007-001001") == (latest, {"counts": {"artists": 2}})


def test_without_a_previous_delivery_there_is_nothing_to_compare(tmp_path):
    assert previous_manifest(tmp_path / "out" / DUMP) is None


def test_a_folder_not_named_after_a_dump_is_no_previous_delivery(tmp_path):
    # Case: a sample or scratch delivery under data/out/, whose name sorts after
    # every timestamp, taken for the latest dump.
    latest = delivery_manifest(tmp_path / "20260909-001002", {"artists": 2})
    delivery_manifest(tmp_path / "sample", {"artists": 1})
    assert previous_manifest(tmp_path / "20261007-001001") == (latest, {"counts": {"artists": 2}})


@pytest.mark.parametrize(
    "content",
    [
        pytest.param('{"counts": {"artists"', id="truncated"),
        pytest.param('{"dump": "20260909-001002"}', id="without-counts"),
        pytest.param('{"counts": {"artists": "12"}}', id="a-count-not-a-number"),
        pytest.param('{"counts": {}, "link_exclusions": 3}', id="a-counter-group-not-a-table"),
        pytest.param(
            '{"counts": {}, "release_status": {"unknown": null}}', id="a-counter-not-a-number"
        ),
    ],
)
def test_a_previous_manifest_without_readable_counts_stops_with_its_path(tmp_path, content):
    # Case: a manifest cut short by a killed run — written in place, not aside —
    # failing every later run on a bare traceback instead of naming the file.
    out = tmp_path / "20260909-001002"
    out.mkdir()
    (out / "manifest.json").write_text(content, encoding="utf-8")
    with pytest.raises(SystemExit) as raised:
        previous_manifest(out)
    assert str(out / "manifest.json") in str(raised.value)


@pytest.mark.parametrize(
    ("name", "group"),
    [
        ("link_exclusions.not_on_page", "link_exclusions"),
        # Case: a table, a bare group, an empty counter or an unknown group
        # read as a counter, and accepting a group then letting it through.
        ("links", None),
        ("link_exclusions", None),
        ("link_exclusions.", None),
        ("links.not_on_page", None),
    ],
)
def test_the_group_of_a_counter_is_the_counter_table_before_its_dot(name, group):
    assert group_of(name) == group


@pytest.mark.parametrize(
    ("accepted", "name", "let_through"),
    [
        (["urls"], "urls", True),
        (["link_exclusions.not_on_page"], "link_exclusions.not_on_page", True),
        (["link_exclusions"], "link_exclusions.not_on_page", True),
        # Case: a counter accepting its sibling, a group accepting another
        # group's counter, a table accepting what merely starts with its name.
        (["link_exclusions.not_on_page"], "link_exclusions.to_unextracted_artist", False),
        (["release_status"], "link_exclusions.not_on_page", False),
        (["links"], "links.not_on_page", False),
        ([], "urls", False),
    ],
)
def test_a_move_is_accepted_under_its_own_name_or_its_group(accepted, name, let_through):
    assert accepts(accepted, name) is let_through
