"""The sample: the pipeline run on the versioned witnesses of tests/fixtures/
instead of the full dumps. The tests build on it, and `musilogy load --sample`
loads it into a workstation's database: the production code path, at a size a
laptop holds."""

from __future__ import annotations

from pathlib import Path

import duckdb

from musilogy import REFERENCE_DISCOGRAPHY, REFERENCE_DUMP, REFERENCE_POPULARITY
from musilogy.build import build, connect
from musilogy.paths import FIXTURES_DIR, SQL_DIR
from musilogy.publish import publish


def build_sample(con: duckdb.DuckDBPyConnection) -> None:
    build(
        con,
        SQL_DIR,
        FIXTURES_DIR / "artists.jsonl",
        FIXTURES_DIR / "release_groups.jsonl",
        popularity=FIXTURES_DIR / "popularity.jsonl",
        popularity_snapshot=REFERENCE_POPULARITY,
        discography=FIXTURES_DIR / "discography.jsonl",
        discography_snapshot=REFERENCE_DISCOGRAPHY,
        official=[FIXTURES_DIR / "official.jsonl"],
        discogs=FIXTURES_DIR / "discogs.jsonl",
    )


def publish_sample(out: Path) -> Path:
    """Publishes the sample as a delivery `load` accepts, and returns its directory."""
    con = connect()
    build_sample(con)
    publish(con, out, REFERENCE_DUMP, None)
    return out
