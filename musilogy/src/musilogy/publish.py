"""Writes the deliverables: one Parquet file per table, and the manifest."""

from __future__ import annotations

import json
import subprocess
from pathlib import Path
from typing import Any

import duckdb

from musilogy.fetch import expected_sums, sha256_file
from musilogy.paths import PACKAGE_DIR, REFERENCE_DIR, popularity_sums

TABLES = ("artists", "albums", "genres", "links", "popularity")
# A delivery has to come out in a fixed order, or the same code on the same
# extraction writes different bytes: the tables are built by parallel joins and
# aggregates, so their insertion order is whatever the threads produced. Each
# key below is total — the uniqueness invariants of 90_invariants.sql are what
# make it one. NULLS LAST is spelled out because links' key is NULL on most
# of its rows and DuckDB's placement is a session setting (default_null_order),
# not a property of the query.
ORDER_BY = {
    "artists": "mbid",
    "albums": "rg_mbid",
    "genres": "genre_mbid",
    "links": "src_mbid, dst_mbid, type, y_begin NULLS LAST, y_end NULLS LAST",
    "popularity": "mbid",
}


def _git_sha() -> str:
    try:
        return subprocess.run(
            ["git", "rev-parse", "HEAD"],
            capture_output=True,
            text=True,
            check=True,
            cwd=PACKAGE_DIR,
        ).stdout.strip()
    except (subprocess.CalledProcessError, OSError):
        return "unknown"


def _counters(con: duckdb.DuckDBPyConnection, table: str) -> dict[str, int]:
    """Counter table -> manifest entry. Read by column name, never by position:
    a counter added to the SQL surfaces without touching this function."""
    result = con.execute(f"SELECT * FROM {table}")
    assert result.description is not None
    names = [c[0] for c in result.description]
    row = result.fetchone()
    assert row is not None  # counter tables are single-row aggregates
    return {name: int(value) for name, value in zip(names, row, strict=True)}


def _count(con: duckdb.DuckDBPyConnection, table: str) -> int:
    row = con.execute(f"SELECT count(*) FROM {table}").fetchone()
    assert row is not None  # COUNT(*) always returns exactly one row
    return int(row[0])


def _extraction(path: Path | None) -> dict[str, Any] | None:
    """Three distinguishable states, because no record and a broken record are
    not the same thing. The sidecar is an external file read at a boundary, and
    the very failure it exists to reveal — a truncated extraction — is the one
    that can leave it unparseable: a bare json.loads would take the whole
    manifest down with it, losing the counts and the parameters, which have
    nothing to do with the sidecar. A file truncated mid-character fails at
    decode before parsing ever runs, raising UnicodeDecodeError rather than
    JSONDecodeError; both are ValueErrors, so catching ValueError covers each
    without naming them separately."""
    if path is None or not path.exists():
        return None
    try:
        recorded = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {"unreadable": True}
    return recorded if isinstance(recorded, dict) else {"unreadable": True}


def _extraction_matches_rows_loaded(
    extraction: dict[str, Any] | None, rows_loaded: dict[str, int]
) -> bool | None:
    """None means "no record", never conflated with a mismatch: a sidecar
    that is absent, unreadable, or missing a count says nothing, it does not
    say the extraction was clean."""
    if extraction is None or "unreadable" in extraction:
        return None
    if "artists_kept" not in extraction or "release_groups_kept" not in extraction:
        return None
    return bool(
        extraction["artists_kept"] == rows_loaded["raw_artists"]
        and extraction["release_groups_kept"] == rows_loaded["raw_release_groups"]
    )


INPUT_TABLES = ("raw_artists", "raw_release_groups", "raw_popularity")


def input_rows_loaded(con: duckdb.DuckDBPyConnection) -> dict[str, int]:
    return {table: _count(con, table) for table in INPUT_TABLES}


def extraction_matches_rows_loaded(
    con: duckdb.DuckDBPyConnection, extraction: Path | None
) -> bool | None:
    """Public because the run has to ask before anything is written: publishing
    first and failing after would replace a sound delivery with a truncated
    one, and a consumer reading the Parquet without the manifest would never
    know. The manifest reports the same verdict through the same two
    functions, so the two answers cannot drift."""
    return _extraction_matches_rows_loaded(_extraction(extraction), input_rows_loaded(con))


PARAMETERS = ("dump_year", "min_year")


def _parameters(con: duckdb.DuckDBPyConnection) -> dict[str, Any]:
    """Read back from the connection, never taken from the caller: the manifest
    must say which bounds the build ran under, not the ones we meant to set."""
    row = con.execute(
        "SELECT " + ", ".join(f"getvariable('{name}')" for name in PARAMETERS)
    ).fetchone()
    assert row is not None  # a single-row projection always returns one row
    return dict(zip(PARAMETERS, row, strict=True))


def _popularity(con: duckdb.DuckDBPyConnection) -> dict[str, Any] | None:
    """Read back from the connection, like the parameters: the snapshot the
    build loaded, with the digest pinned for it."""
    row = con.execute("SELECT getvariable('popularity_snapshot')::VARCHAR").fetchone()
    assert row is not None  # a single-row projection always returns one row
    if row[0] is None:
        return None
    return {"snapshot": row[0], "sha256": expected_sums(popularity_sums(row[0]))}


def publish(
    con: duckdb.DuckDBPyConnection,
    out_dir: Path,
    dump: str,
    corrections: Path | None,
    extraction: Path | None = None,
) -> dict[str, Any]:
    out_dir.mkdir(parents=True, exist_ok=True)

    counts: dict[str, int] = {}
    for name in TABLES:
        con.execute(
            f"COPY (SELECT * FROM {name} ORDER BY {ORDER_BY[name]}) TO ?"
            " (FORMAT parquet, COMPRESSION zstd)",
            [(out_dir / f"{name}.parquet").as_posix()],
        )
        counts[name] = _count(con, name)

    # A file this run did not write — a table dropped from the schema, an
    # export retired — would otherwise stay in the delivery and be digested
    # into the manifest as if this run had produced it.
    written = {f"{name}.parquet" for name in TABLES} | {"manifest.json"}
    for stale in out_dir.rglob("*"):
        if stale.is_file() and stale.relative_to(out_dir).as_posix() not in written:
            stale.unlink()

    rows_loaded = input_rows_loaded(con)
    extraction_record = _extraction(extraction)

    # Read back from disk once every file is written and the stale ones are
    # gone, never accumulated as they are produced: the manifest has to
    # describe the delivery that is there, not the one this run meant to write.
    # manifest.json is excluded because it is the file carrying these digests.
    output_sha256 = {
        path.relative_to(out_dir).as_posix(): sha256_file(path)
        for path in sorted(out_dir.rglob("*"))
        if path.is_file() and path.name != "manifest.json"
    }

    manifest = {
        "dump": dump,
        "archive_sha256": expected_sums(REFERENCE_DIR / f"{dump}.SHA256SUMS"),
        "popularity": _popularity(con),
        "counts": counts,
        "output_sha256": output_sha256,
        "parameters": _parameters(con),
        "inputs": {
            "rows_loaded": rows_loaded,
            # Read back rather than recomputed: these counts were taken while
            # the archive was being read, and comparing them to rows_loaded is
            # the only way a truncated extraction shows up at all.
            "extraction": extraction_record,
            # The comparison itself, not left to a human subtracting two
            # numbers in the manifest: see _extraction_matches_rows_loaded.
            "extraction_matches_rows_loaded": _extraction_matches_rows_loaded(
                extraction_record, rows_loaded
            ),
        },
        "r2_anomalies": _counters(con, "r2_anomalies"),
        "neutralised_inferences": _counters(con, "neutralised_inferences"),
        "link_exclusions": _counters(con, "link_exclusions"),
        "git_sha": _git_sha(),
        "corrections_sha256": sha256_file(corrections) if corrections else None,
    }
    (out_dir / "manifest.json").write_text(
        json.dumps(manifest, indent=1, ensure_ascii=False), encoding="utf-8"
    )
    return manifest
