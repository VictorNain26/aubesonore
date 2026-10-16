"""Writes the deliverables: one Parquet file per table, and the manifest."""

from __future__ import annotations

import json
import math
import subprocess
from collections.abc import Callable, Collection, Mapping, Sequence
from pathlib import Path
from typing import Any, NamedTuple

import duckdb

from musilogy.build import scalar
from musilogy.colisten import PARAMETERS as COLISTEN_PARAMETERS
from musilogy.fetch import expected_sums, sha256_file
from musilogy.paths import (
    PACKAGE_DIR,
    discography_sums,
    discogs_extraction,
    discogs_sums,
    dump_sums,
    listening_sums,
    official_sums,
    popularity_sums,
)

TABLES = (
    "artists",
    "albums",
    "links",
    "popularity",
    "releases",
    "urls",
    "colisten",
    "styles",
    "same_sound",
)
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
    "links": "src_mbid, dst_mbid, type, y_begin NULLS LAST, y_end NULLS LAST",
    "popularity": "mbid",
    "releases": "artist_mbid, rg_mbid",
    "urls": "artist_mbid, type NULLS LAST, url",
    "colisten": "artist_mbid, rank",
    "styles": "artist_mbid, decade NULLS LAST, style",
    "same_sound": "artist_mbid, rank",
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


def read_extraction(path: Path | None) -> dict[str, Any] | None:
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
    return {table: scalar(con, f"SELECT count(*) FROM {table}") for table in INPUT_TABLES}


def extraction_matches_rows_loaded(
    con: duckdb.DuckDBPyConnection, extraction: Path | None
) -> bool | None:
    """Public because the run has to ask before anything is written: publishing
    first and failing after would replace a sound delivery with a truncated
    one, and a consumer reading the Parquet without the manifest would never
    know. The manifest reports the same verdict through the same two
    functions, so the two answers cannot drift."""
    return _extraction_matches_rows_loaded(read_extraction(extraction), input_rows_loaded(con))


# Set by 88_same_sound.sql, where the rule lives.
SAME_SOUND_PARAMETERS = (
    "same_sound_min_colour",
    "same_sound_styles_shrink",
    "same_sound_genres_shrink",
    "same_sound_min_style_records",
)
PARAMETERS = ("dump_year", "min_year", *COLISTEN_PARAMETERS, *SAME_SOUND_PARAMETERS)


def _parameters(con: duckdb.DuckDBPyConnection) -> dict[str, Any]:
    """Read back from the connection, never taken from the caller: the manifest
    must say which bounds the build ran under, not the ones we meant to set."""
    row = con.execute(
        "SELECT " + ", ".join(f"getvariable('{name}')" for name in PARAMETERS)
    ).fetchone()
    assert row is not None  # a single-row projection always returns one row
    return dict(zip(PARAMETERS, row, strict=True))


def _snapshot(
    con: duckdb.DuckDBPyConnection, variable: str, sums: Callable[[str], Path]
) -> dict[str, Any] | None:
    """Read back from the connection, like the parameters: the snapshot the
    build loaded, with the digest pinned for it."""
    row = con.execute(f"SELECT getvariable('{variable}')::VARCHAR").fetchone()
    assert row is not None  # a single-row projection always returns one row
    if row[0] is None:
        return None
    return {"snapshot": row[0], "sha256": expected_sums(sums(row[0]))}


def _parts(
    con: duckdb.DuckDBPyConnection, variable: str, sums: Callable[[str], Path]
) -> list[dict[str, Any]] | None:
    """The parts of a survey the build loaded, each with its pinned digest."""
    row = con.execute(f"SELECT getvariable('{variable}')::VARCHAR[]").fetchone()
    assert row is not None  # a single-row projection always returns one row
    if row[0] is None:
        return None
    return [{"snapshot": d, "sha256": expected_sums(sums(d))} for d in row[0]]


def _discogs(con: duckdb.DuckDBPyConnection) -> dict[str, Any] | None:
    """The Discogs dump the build read, with its pinned digest and the sidecar
    of its projection."""
    row = con.execute("SELECT getvariable('discogs_dump')").fetchone()
    assert row is not None  # a single-row projection always returns one row
    if row[0] is None:
        return None
    return {
        "dump": row[0],
        "sha256": expected_sums(discogs_sums(row[0])),
        "extraction": read_extraction(discogs_extraction(row[0])),
    }


def publish(
    con: duckdb.DuckDBPyConnection,
    out_dir: Path,
    dump: str,
    extraction: Path | None = None,
    trace: Trace | None = None,
) -> dict[str, Any]:
    """`trace` is what the comparison with the previous delivery let through:
    the drifts the run was told to accept, the counters new and gone. The
    delivery records it, so the trace of a move stays with the counts it
    moved."""
    out_dir.mkdir(parents=True, exist_ok=True)

    for name in TABLES:
        con.execute(
            f"COPY (SELECT * FROM {name} ORDER BY {ORDER_BY[name]}) TO ?"
            " (FORMAT parquet, COMPRESSION zstd)",
            [(out_dir / f"{name}.parquet").as_posix()],
        )

    # A file this run did not write — a table dropped from the schema, an
    # export retired — would otherwise stay in the delivery and be digested
    # into the manifest as if this run had produced it.
    written = {f"{name}.parquet" for name in TABLES} | {"manifest.json"}
    for stale in out_dir.rglob("*"):
        if stale.is_file() and stale.relative_to(out_dir).as_posix() not in written:
            stale.unlink()

    rows_loaded = input_rows_loaded(con)
    extraction_record = read_extraction(extraction)

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
        "archive_sha256": expected_sums(dump_sums(dump)),
        "popularity": _snapshot(con, "popularity_snapshot", popularity_sums),
        "discography": _snapshot(con, "discography_snapshot", discography_sums),
        "official": _parts(con, "official_snapshots", official_sums),
        "listening": _snapshot(con, "listening_snapshot", listening_sums),
        "discogs": _discogs(con),
        "counts": table_counts(con),
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
        **counters(con),
        **_trace(trace),
        "git_sha": _git_sha(),
    }
    (out_dir / "manifest.json").write_text(
        json.dumps(manifest, indent=1, ensure_ascii=False), encoding="utf-8"
    )
    return manifest


# The largest move of a table's row count, or of a counter, relative to the
# previous delivery, that `musilogy run` publishes without being told. Every
# move of a table count the history records, while the counts were frozen in a
# test, came from a rule change; the smallest was +0.636 % (genres, every
# artist type joining, a7361cf3). The limit sits below it, so none would go
# through unannounced. Counters are held to the same limit: on one under 200,
# any move is past it.
MAX_DRIFT = 0.005


class Drift(NamedTuple):
    """A table's count or a counter (named as compared() names it) that moved
    past the limit since the previous delivery."""

    name: str
    expected: int
    got: int

    @property
    def absolute(self) -> int:
        return self.got - self.expected

    @property
    def relative(self) -> float:
        return self.absolute / self.expected if self.expected else math.inf

    def __str__(self) -> str:
        return (
            f"{self.name}: expected {self.expected}, got {self.got}, "
            f"{self.absolute:+d} ({self.relative:+.2%})"
        )


def table_counts(con: duckdb.DuckDBPyConnection) -> dict[str, int]:
    """The row count of every delivered table, as the manifest records it."""
    return {name: scalar(con, f"SELECT count(*) FROM {name}") for name in TABLES}


# Every counter table the manifest carries, each under its own name: _counters
# reads it whole, so a counter added to the SQL is written and compared
# without touching this list. --accept-drift takes a group under its bare
# name, as it takes a table: no group may be named like a table.
COUNTER_TABLES = (
    "r2_anomalies",
    "neutralised_inferences",
    "link_exclusions",
    "discography_exclusions",
    "release_status",
    "discogs_coverage",
    "discogs_date_disagreements",
)


def counters(con: duckdb.DuckDBPyConnection) -> dict[str, dict[str, int]]:
    """Every counter table, as the manifest records it."""
    return {table: _counters(con, table) for table in COUNTER_TABLES}


def group_of(name: str) -> str | None:
    """The group of a counter as compared() names it, GROUP.COUNTER with GROUP
    a counter table; None for anything else."""
    group, _, counter = name.partition(".")
    return group if group in COUNTER_TABLES and counter else None


def is_counter(name: str) -> bool:
    return group_of(name) is not None


def accepts(accepted: Collection[str], name: str) -> bool:
    """Whether `accepted`, names given to --accept-drift, lets the move of
    `name`, as compared() names it, through: named itself, or a counter of a
    group named."""
    return name in accepted or group_of(name) in accepted


def compared(manifest: Mapping[str, Any]) -> dict[str, int]:
    """What a manifest says the drift guard compares: each table's count under
    the table's name, each counter under GROUP.COUNTER — two groups may count
    under the same name, and no table name holds a dot. A group the manifest
    lacks, from a delivery predating it, contributes nothing."""
    return {
        **manifest["counts"],
        **{
            f"{group}.{name}": n
            for group in COUNTER_TABLES
            for name, n in manifest.get(group, {}).items()
        },
    }


def delivered(con: duckdb.DuckDBPyConnection) -> dict[str, int]:
    """What this build would publish, as compared() reads it from a manifest."""
    return compared({"counts": table_counts(con), **counters(con)})


class Comparison(NamedTuple):
    """compare()'s answer: what stops the run unless accepted, and what it
    only says — each new counter with its count, each one gone with the count
    it last had."""

    drifts: Sequence[Drift]
    new: Mapping[str, int]
    gone: Mapping[str, int]


class Trace(NamedTuple):
    """What a comparison let through, as the delivery records it: the drifts
    accepted, never one refused, and the counters new and gone. A type of its
    own, so that compare()'s answer, every drift in it, cannot be recorded as
    accepted."""

    accepted: Sequence[Drift]
    new: Mapping[str, int]
    gone: Mapping[str, int]


def _trace(trace: Trace | None) -> dict[str, Any]:
    """The manifest's record of a trace, named as compared() names. A key is
    absent rather than empty when it holds nothing, like in a delivery
    predating it: both say the same thing."""
    if trace is None:
        return {}
    entries = {
        "accepted_drifts": [d._asdict() for d in trace.accepted],
        "new_counters": [{"name": name, "got": n} for name, n in trace.new.items()],
        "gone_counters": [{"name": name, "expected": n} for name, n in trace.gone.items()],
    }
    return {key: entry for key, entry in entries.items() if entry}


def compare(
    expected: Mapping[str, int], got: Mapping[str, int], limit: float = MAX_DRIFT
) -> Comparison:
    """What moved from `expected` to `got`, both read through compared(). A
    table or counter that moved past `limit` of `expected` drifts. A table
    `expected` lacks moves from zero; one only `expected` has is retired, and
    publish() removes its file. A counter `expected` lacks is new: the SQL
    added it since, there is nothing to hold it to. One only `expected` has is
    gone: the SQL dropped or renamed it."""
    new = {name: n for name, n in got.items() if name not in expected and is_counter(name)}
    found = [Drift(name, expected.get(name, 0), n) for name, n in got.items() if name not in new]
    return Comparison(
        drifts=[d for d in found if abs(d.absolute) > limit * d.expected],
        new=new,
        gone={name: n for name, n in expected.items() if name not in got and is_counter(name)},
    )


def _numbers(entry: Any) -> bool:
    """A table of counts, as the manifest writes them: bool is an int to
    Python, never to the manifest."""
    return isinstance(entry, dict) and all(
        isinstance(n, int) and not isinstance(n, bool) for n in entry.values()
    )


# A MusicBrainz dump's name, its timestamp (REFERENCE_DUMP): what else sits
# under data/out/ is no delivery of a dump.
DUMP_NAME = "[0-9]" * 8 + "-" + "[0-9]" * 6


def previous_manifest(out: Path) -> tuple[Path, dict[str, Any]] | None:
    """The manifest of the delivery `out` follows: the one at `out`, which
    publishing there overwrites, else that of the latest dump delivered beside
    it (deliveries are named after their dump, a timestamp). A manifest
    without readable counts, or with a counter group that is no table of
    numbers, stops the run: nothing says what it delivered."""
    path = out / "manifest.json"
    if not path.exists():
        beside = sorted(out.parent.glob(f"{DUMP_NAME}/manifest.json"))
        if not beside:
            return None
        path = beside[-1]
    try:
        manifest = json.loads(path.read_text(encoding="utf-8"))
    except ValueError:
        manifest = None
    if not (
        isinstance(manifest, dict)
        and _numbers(manifest.get("counts"))
        and all(_numbers(manifest[group]) for group in COUNTER_TABLES if group in manifest)
    ):
        raise SystemExit(
            f"{path} carries no readable counts: nothing to compare, nothing published"
        )
    return path, manifest
