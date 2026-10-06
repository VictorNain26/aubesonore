import json
import subprocess

import pytest
from conftest import build_synthetic, proximity_file, synthetic_artist

from musilogy import REFERENCE_DUMP as DUMP
from musilogy import REFERENCE_INFLUENCES, REFERENCE_POPULARITY
from musilogy.fetch import expected_sums, sha256_file
from musilogy.paths import PACKAGE_DIR, REFERENCE_DIR, influences_sums, popularity_sums
from musilogy.publish import publish

REF_SUMS = REFERENCE_DIR / f"{DUMP}.SHA256SUMS"


def test_publish_writes_every_table(con, tmp_path):
    manifest = publish(con, tmp_path, DUMP, None)
    for name in ("artists", "albums", "genres", "links", "popularity", "influences", "proximity"):
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
    manifest = publish(con, tmp_path, DUMP, None)
    assert not retired.exists()
    assert not any(name.startswith("web/") for name in manifest["output_sha256"])


def test_publish_removes_a_parquet_it_no_longer_writes(con, tmp_path):
    stale = tmp_path / "genre_parents.parquet"
    stale.write_bytes(b"not a parquet, and it must not survive anyway")
    manifest = publish(con, tmp_path, DUMP, None)
    assert not stale.exists()
    assert "genre_parents" not in manifest["counts"]
    assert (tmp_path / "artists.parquet").exists()


def test_manifest_carries_archive_checksums(con, tmp_path):
    manifest = publish(con, tmp_path, DUMP, None)
    assert manifest["archive_sha256"] == expected_sums(REF_SUMS)


def test_manifest_names_the_popularity_snapshot_the_build_loaded(con, tmp_path):
    manifest = publish(con, tmp_path, DUMP, None)
    assert manifest["popularity"] == {
        "snapshot": REFERENCE_POPULARITY,
        "sha256": expected_sums(popularity_sums(REFERENCE_POPULARITY)),
    }


def test_manifest_names_the_influences_snapshot_the_build_loaded(con, tmp_path):
    manifest = publish(con, tmp_path, DUMP, None)
    assert manifest["influences"] == {
        "snapshot": REFERENCE_INFLUENCES,
        "sha256": expected_sums(influences_sums(REFERENCE_INFLUENCES)),
    }


def test_manifest_names_the_proximity_snapshot_the_build_loaded(tmp_path, monkeypatch):
    # The digest is the one pinned for the snapshot's date, read from its
    # reference file; here a file of this test's own, so the wiring is checked
    # without depending on which snapshot is pinned.
    sums = tmp_path / "listenbrainz-similar.SHA256SUMS"
    sums.write_text(f"{'0' * 64}  artist-similar.jsonl\n", encoding="utf-8")
    monkeypatch.setattr("musilogy.publish.proximity_sums", lambda _date: sums)
    con = build_synthetic(
        tmp_path,
        [synthetic_artist("a", "1990", None)],
        proximity=proximity_file(tmp_path / "proximity.jsonl", {"a": []}),
        proximity_snapshot="2026-10-04",
    )
    manifest = publish(con, tmp_path / "out", DUMP, None)
    assert manifest["proximity"] == {
        "snapshot": "2026-10-04",
        "sha256": {"artist-similar.jsonl": "0" * 64},
    }


def test_manifest_counts_the_repeated_neighbours_it_dropped(con, tmp_path):
    # The first 120 lines of the snapshot repeat one neighbour once (line 119).
    assert publish(con, tmp_path, DUMP, None)["proximity_exclusions"] == {
        "repeated_neighbour": 1,
        "self_neighbour": 0,
    }


def test_a_build_without_snapshot_says_so_in_the_manifest(tmp_path):
    con = build_synthetic(tmp_path, [synthetic_artist("a", "1990", None)])
    manifest = publish(con, tmp_path / "out", DUMP, None)
    assert manifest["popularity"] is None
    assert manifest["influences"] is None
    assert manifest["proximity"] is None


def test_manifest_carries_r2_anomaly_counters(con, tmp_path):
    manifest = publish(con, tmp_path, DUMP, None)
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
        "begin_ambiguous": 0,
    }


def test_manifest_carries_the_seven_neutralised_inference_counters(con, tmp_path):
    # One counter per guard of 30_bands_lifespan.sql. On the witnesses:
    # Polska Radio One (formed 2015, last album 2014) for the end, Wiener
    # Philharmoniker and Handel and Haydn Society (begins below 1850) for the
    # begin, Bach (dead in 1750, recorded from 1961) for an end below 1850. A
    # neutralised anomaly stays visible instead of being absorbed.
    manifest = publish(con, tmp_path, DUMP, None)
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
    manifest = publish(con, tmp_path, DUMP, None)
    expected = subprocess.run(
        ["git", "rev-parse", "HEAD"],
        capture_output=True,
        text=True,
        check=True,
        cwd=PACKAGE_DIR,
    ).stdout.strip()
    assert manifest["git_sha"] == expected


def test_manifest_carries_corrections_checksum_when_present(con, tmp_path):
    corrections = tmp_path / "corrections.csv"
    corrections.write_text("mbid,field,value,justification,source\n", encoding="utf-8")
    manifest = publish(con, tmp_path / "out", DUMP, corrections)
    assert manifest["corrections_sha256"] == sha256_file(corrections)


def test_manifest_corrections_checksum_is_none_without_file(con, tmp_path):
    manifest = publish(con, tmp_path, DUMP, None)
    assert manifest["corrections_sha256"] is None


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
    manifest = publish(c, tmp_path / "out", DUMP, None)

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
    publish(con, tmp_path, DUMP, None)
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
    manifest = publish(c, tmp_path / "out", DUMP, None)
    assert manifest["parameters"] == {"dump_year": 2030, "min_year": 1900}


def test_manifest_counts_the_rows_that_fed_the_build(con, tmp_path):
    manifest = publish(con, tmp_path, DUMP, None)
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
    manifest = publish(con, tmp_path / "out", DUMP, None, sidecar)
    assert manifest["inputs"]["extraction"]["artists_kept"] == 7
    assert manifest["inputs"]["extraction"]["release_groups_dropped"] == 11


def test_manifest_says_so_when_no_extraction_record_exists(con, tmp_path):
    # The synthetic builds have no extraction step at all. Null is the honest
    # answer; an absent key would let a reader assume nothing was dropped.
    manifest = publish(con, tmp_path, DUMP, None)
    assert manifest["inputs"]["extraction"] is None


def test_manifest_survives_a_truncated_extraction_record(con, tmp_path):
    # A truncated sidecar is precisely the "full disk during extraction"
    # scenario this task targets. A bare json.loads used to raise
    # JSONDecodeError and take the whole manifest down with it: no counts, no
    # parameters, even though those have nothing to do with the sidecar.
    sidecar = tmp_path / "extraction.json"
    sidecar.write_text('{"artists_kept": 7', encoding="utf-8")
    manifest = publish(con, tmp_path / "out", DUMP, None, sidecar)
    assert manifest["counts"]
    assert manifest["inputs"]["extraction"] == {"unreadable": True}


def test_manifest_survives_an_extraction_record_that_is_not_an_object(con, tmp_path):
    # A JSON file whose top level is a list parses without error and would
    # otherwise flow into the manifest as a shape no reader expects.
    sidecar = tmp_path / "extraction.json"
    sidecar.write_text("[1, 2, 3]", encoding="utf-8")
    manifest = publish(con, tmp_path / "out", DUMP, None, sidecar)
    assert manifest["inputs"]["extraction"] == {"unreadable": True}


def test_manifest_survives_a_sidecar_truncated_mid_character(con, tmp_path):
    # MusicBrainz names are full of non-ASCII; a truncation landing inside a
    # multi-byte character fails at decode, before json.loads ever runs,
    # raising UnicodeDecodeError rather than JSONDecodeError. This fails if the
    # except clause is narrowed back to json.JSONDecodeError alone.
    sidecar = tmp_path / "extraction.json"
    sidecar.write_bytes('{"name": "Motörhead"}'.encode()[:14])
    manifest = publish(con, tmp_path / "out", DUMP, None, sidecar)
    assert manifest["counts"]
    assert manifest["inputs"]["extraction"] == {"unreadable": True}


def test_manifest_says_so_when_the_extraction_path_does_not_exist(con, tmp_path):
    manifest = publish(con, tmp_path, DUMP, None, tmp_path / "missing-extraction.json")
    assert manifest["inputs"]["extraction"] is None


def test_manifest_says_extraction_matches_rows_loaded_when_counts_agree(con, tmp_path):
    # 673 artists and 10536 release-groups are what the fixtures actually load
    # (test_manifest_counts_the_rows_that_fed_the_build): a sidecar claiming
    # exactly those counts is the case the discrepancy check must let through.
    sidecar = tmp_path / "extraction.json"
    sidecar.write_text(
        json.dumps({"artists_kept": 673, "release_groups_kept": 10536}), encoding="utf-8"
    )
    manifest = publish(con, tmp_path / "out", DUMP, None, sidecar)
    assert manifest["inputs"]["extraction_matches_rows_loaded"] is True


def test_manifest_says_extraction_does_not_match_rows_loaded_on_a_mismatch(con, tmp_path):
    # A truncated extraction: fewer release-groups made it to disk than the
    # extraction step reported keeping. The boolean must go False rather than
    # leave a human to subtract the two numbers by hand.
    sidecar = tmp_path / "extraction.json"
    sidecar.write_text(
        json.dumps({"artists_kept": 28, "release_groups_kept": 3627}), encoding="utf-8"
    )
    manifest = publish(con, tmp_path / "out", DUMP, None, sidecar)
    assert manifest["inputs"]["extraction_matches_rows_loaded"] is False


def test_manifest_extraction_match_is_none_without_a_sidecar(con, tmp_path):
    # "No record" is not "mismatch": three states, not two.
    manifest = publish(con, tmp_path, DUMP, None)
    assert manifest["inputs"]["extraction_matches_rows_loaded"] is None


def test_manifest_extraction_match_is_none_when_the_sidecar_is_unreadable(con, tmp_path):
    sidecar = tmp_path / "extraction.json"
    sidecar.write_text('{"artists_kept": 7', encoding="utf-8")
    manifest = publish(con, tmp_path / "out", DUMP, None, sidecar)
    assert manifest["inputs"]["extraction_matches_rows_loaded"] is None


def test_manifest_extraction_match_is_none_when_a_count_key_is_missing(con, tmp_path):
    sidecar = tmp_path / "extraction.json"
    sidecar.write_text(json.dumps({"artists_kept": 28}), encoding="utf-8")
    manifest = publish(con, tmp_path / "out", DUMP, None, sidecar)
    assert manifest["inputs"]["extraction_matches_rows_loaded"] is None


# A delivery is reproducible only if its rows come out in a fixed order: same
# code and same extraction must give the same bytes, or no consumer can cache
# by digest and no two dumps can be diffed. The engine builds these tables with
# parallel joins and aggregates, so insertion order is whatever the threads
# produced — publishing has to impose the order itself.
PARQUET_KEYS = {
    "artists": ["mbid"],
    "albums": ["rg_mbid"],
    "genres": ["genre_mbid"],
    "links": ["src_mbid", "dst_mbid", "type", "y_begin", "y_end"],
    "influences": ["artist_mbid", "influence_mbid"],
    "proximity": ["artist_mbid", "rank"],
}


def nulls_last(row):
    """links' key carries NULL years on many of its rows, so the test
    has to state where NULLs sort — Python refuses to compare None to an int,
    and DuckDB's placement is a session setting rather than a property of the
    query."""
    return tuple((value is None, value) for value in row)


@pytest.mark.parametrize("table", sorted(PARQUET_KEYS))
def test_published_parquet_rows_are_ordered_by_their_key(con, tmp_path, table):
    publish(con, tmp_path, DUMP, None)
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
    manifest = publish(con, tmp_path, DUMP, None)
    delivered = {
        path.relative_to(tmp_path).as_posix()
        for path in tmp_path.rglob("*")
        if path.is_file() and path.name != "manifest.json"
    }
    assert set(manifest["output_sha256"]) == delivered
    for name, digest in manifest["output_sha256"].items():
        assert digest == sha256_file(tmp_path / name)
