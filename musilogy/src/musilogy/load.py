"""Loads a published delivery into the site's Postgres, in the `musilogy` schema."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import duckdb

from musilogy.build import connect
from musilogy.fetch import ChecksumError, sha256_file
from musilogy.paths import PG_DIR

SCHEMA = "musilogy"
STAGING = "musilogy_next"
TABLES = ("artists", "genres", "links", "popularity", "influences", "releases", "urls", "proximity")
# Postgres has no anonymous composite type: a list of genre structs travels as
# JSON.
PROJECTIONS = {
    "artists": "* REPLACE ("
    "to_json(genres_declared) AS genres_declared, "
    "to_json(genres_from_albums) AS genres_from_albums, "
    "to_json(genres) AS genres)",
}


def _verified_manifest(published: Path) -> dict[str, Any]:
    """The delivery is read at a boundary: a run interrupted mid-publish, or a
    file touched since, must not reach the site."""
    manifest: dict[str, Any] = json.loads((published / "manifest.json").read_text(encoding="utf-8"))
    digests = manifest["output_sha256"]
    for table in TABLES:
        name = f"{table}.parquet"
        if sha256_file(published / name) != digests.get(name):
            raise ChecksumError(f"{name} does not match the manifest of {published}")
    return manifest


class LoadError(Exception):
    pass


def _execute(con: duckdb.DuckDBPyConnection, sql: str) -> None:
    con.execute("CALL postgres_execute('site', ?)", [sql])


def _sql(name: str) -> str:
    return (PG_DIR / name).read_text(encoding="utf-8")


def _count(con: duckdb.DuckDBPyConnection, table: str) -> int:
    row = con.execute(
        f"SELECT n FROM postgres_query('site', 'SELECT count(*) AS n FROM {table}')"
    ).fetchone()
    assert row is not None  # COUNT(*) always returns exactly one row
    return int(row[0])


def load(published: Path, conninfo: str = "") -> dict[str, int]:
    """Fills the staging schema, then swaps it in as `musilogy` in one
    transaction: the site never reads a partial load, and a failed one leaves
    the previous load in place. The connection comes from the libpq
    environment (PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE, PGSSLMODE,
    PGSSLROOTCERT) unless a libpq connection string is given, so no
    credential travels through the command line."""
    manifest = _verified_manifest(published)
    con = connect()
    con.execute("INSTALL postgres")
    con.execute("LOAD postgres")
    escaped = conninfo.replace("'", "''")
    con.execute(f"ATTACH '{escaped}' AS site (TYPE postgres)")

    _execute(
        con,
        f"DROP SCHEMA IF EXISTS {STAGING} CASCADE; CREATE SCHEMA {STAGING}; "
        f"SET search_path TO {STAGING}; " + _sql("10_tables.sql") + "; RESET search_path",
    )
    for table in TABLES:
        con.execute(
            f"INSERT INTO site.{STAGING}.{table} BY NAME "
            f"SELECT {PROJECTIONS.get(table, '*')} FROM read_parquet(?)",
            [(published / f"{table}.parquet").as_posix()],
        )
    snapshots = [
        manifest[name]["snapshot"] if isinstance(manifest[name], dict) else None
        for name in ("popularity", "influences", "discography")
    ]
    parts = [part["snapshot"] for part in manifest["proximity"] or []] or None
    con.execute(
        f"INSERT INTO site.{STAGING}.manifest (dump, popularity_snapshot, influences_snapshot, "
        "discography_snapshot, proximity_snapshots, git_sha) "
        "VALUES (?, ?, ?, ?, ?::DATE[], ?)",
        [manifest["dump"], *snapshots, parts, manifest["git_sha"]],
    )
    # Everything after the copy, on the staging schema; 90_ reads the final
    # schema and runs once it is swapped in.
    for path in sorted(PG_DIR.glob("*.sql")):
        if path.name != "10_tables.sql" and not path.name.startswith("90_"):
            _execute(
                con, f"SET search_path TO {STAGING}; " + _sql(path.name) + "; RESET search_path"
            )
    loaded = {table: _count(con, f"{STAGING}.{table}") for table in TABLES}
    expected = {table: manifest["counts"][table] for table in TABLES}
    if loaded != expected:
        raise LoadError(f"staging holds {loaded}, the delivery {expected}: nothing swapped")
    _execute(
        con,
        f"BEGIN; DROP SCHEMA IF EXISTS {SCHEMA} CASCADE; "
        f"ALTER SCHEMA {STAGING} RENAME TO {SCHEMA}; "
        + "; ".join(_sql(path.name) for path in sorted(PG_DIR.glob("90_*.sql")))
        + "; COMMIT",
    )
    con.close()
    return loaded
