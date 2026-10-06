"""Chains the transformation SQL files on a DuckDB connection."""

from __future__ import annotations

from collections.abc import Sequence
from pathlib import Path

import duckdb

from musilogy.paths import DATA_DIR


def connect() -> duckdb.DuckDBPyConnection:
    """The pipeline runs on a shared server. DuckDB's defaults (80 % of RAM,
    spill up to 90 % of free disk, one thread per core) let one query starve
    every service beside it. Under these bounds DuckDB spills, then fails,
    rather than taking the machine down; fewer threads also mean fewer
    operators holding memory at once."""
    return duckdb.connect(
        ":memory:",
        config={
            "memory_limit": "2GB",
            "threads": 2,
            "max_temp_directory_size": "10GB",
            # In memory, DuckDB spills to `.tmp` under the caller's cwd:
            # anchored on the data instead, created only when a query spills.
            "temp_directory": (DATA_DIR / "tmp").as_posix(),
        },
    )


RAW_ARTIST_COLUMNS = (
    "{mbid:'VARCHAR', name:'VARCHAR', disambiguation:'VARCHAR', type:'VARCHAR', begin:'VARCHAR', "
    "\"end\":'VARCHAR', ended:'BOOLEAN', country:'VARCHAR', begin_area:'VARCHAR', "
    "begin_area_mbid:'VARCHAR', "
    "genres:'STRUCT(mbid VARCHAR, name VARCHAR, votes INTEGER)[]', "
    "relations:'STRUCT(type VARCHAR, direction VARCHAR, mbid VARCHAR, begin VARCHAR, "
    '"end" VARCHAR)[]\', '
    "urls:'STRUCT(type VARCHAR, url VARCHAR, ended BOOLEAN)[]'}"
)
RAW_RG_COLUMNS = (
    "{mbid:'VARCHAR', title:'VARCHAR', primary_type:'VARCHAR', date:'VARCHAR', "
    "secondary:'VARCHAR[]', artists:'VARCHAR[]', "
    "genres:'STRUCT(mbid VARCHAR, name VARCHAR, votes INTEGER)[]'}"
)


def load_raw(con: duckdb.DuckDBPyConnection, artists: Path, rgs: Path) -> None:
    con.execute(
        f"CREATE OR REPLACE TABLE raw_artists AS SELECT * FROM read_ndjson("
        f"'{artists.as_posix()}', columns={RAW_ARTIST_COLUMNS}, "
        f"format='newline_delimited')"
    )
    con.execute(
        f"CREATE OR REPLACE TABLE raw_release_groups AS SELECT * FROM read_ndjson("
        f"'{rgs.as_posix()}', columns={RAW_RG_COLUMNS}, format='newline_delimited')"
    )


RAW_POPULARITY_COLUMNS = (
    "{artist_mbid:'VARCHAR', total_listen_count:'BIGINT', total_user_count:'BIGINT'}"
)


def load_popularity(
    con: duckdb.DuckDBPyConnection, popularity: Path | None, snapshot: str | None
) -> None:
    if popularity is None:
        # Always materialized, even empty, like corrections: synthetic builds
        # carry no snapshot, and 87_popularity.sql reads this table anyway.
        con.execute(
            "CREATE OR REPLACE TABLE raw_popularity (artist_mbid VARCHAR, "
            "total_listen_count BIGINT, total_user_count BIGINT)"
        )
    else:
        con.execute(
            f"CREATE OR REPLACE TABLE raw_popularity AS SELECT * FROM read_ndjson("
            f"'{popularity.as_posix()}', columns={RAW_POPULARITY_COLUMNS}, "
            f"format='newline_delimited')"
        )
    con.execute(
        "SET VARIABLE popularity_snapshot = "
        + ("NULL" if snapshot is None else f"DATE '{snapshot}'")
    )


RAW_INFLUENCE_COLUMNS = "{artist_mbid:'VARCHAR', influence_mbid:'VARCHAR', statement:'VARCHAR'}"


def load_influences(
    con: duckdb.DuckDBPyConnection, influences: Path | None, snapshot: str | None
) -> None:
    if influences is None:
        # Always materialized, even empty, like popularity: synthetic builds
        # carry no snapshot, and 88_influences.sql reads this table anyway.
        con.execute(
            "CREATE OR REPLACE TABLE raw_influences (artist_mbid VARCHAR, "
            "influence_mbid VARCHAR, statement VARCHAR)"
        )
    else:
        con.execute(
            f"CREATE OR REPLACE TABLE raw_influences AS SELECT * FROM read_ndjson("
            f"'{influences.as_posix()}', columns={RAW_INFLUENCE_COLUMNS}, "
            f"format='newline_delimited')"
        )
    con.execute(
        "SET VARIABLE influences_snapshot = "
        + ("NULL" if snapshot is None else f"DATE '{snapshot}'")
    )


RAW_DISCOGRAPHY_COLUMNS = "{rg_mbid:'VARCHAR', form:'VARCHAR'}"


def load_discography(
    con: duckdb.DuckDBPyConnection, discography: Path | None, snapshot: str | None
) -> None:
    if discography is None:
        # Always materialized, even empty, like influences: synthetic builds
        # carry no snapshot, and 22_releases.sql reads this table anyway.
        con.execute("CREATE OR REPLACE TABLE raw_discography (rg_mbid VARCHAR, form VARCHAR)")
    else:
        con.execute(
            f"CREATE OR REPLACE TABLE raw_discography AS SELECT * FROM read_ndjson("
            f"'{discography.as_posix()}', columns={RAW_DISCOGRAPHY_COLUMNS}, "
            f"format='newline_delimited')"
        )
    con.execute(
        "SET VARIABLE discography_snapshot = "
        + ("NULL" if snapshot is None else f"DATE '{snapshot}'")
    )


# "similar" is the snapshot's key, and a reserved word in SQL: renamed on read.
RAW_PROXIMITY_COLUMNS = (
    "{artist_mbid:'VARCHAR', \"similar\":'STRUCT(artist_mbid VARCHAR, score INTEGER)[]'}"
)


def load_proximity(
    con: duckdb.DuckDBPyConnection, parts: Sequence[Path], snapshots: Sequence[str] | None
) -> None:
    """A survey too long to take again is taken in parts: each asks the artists
    no earlier part asked (cli.snapshot_proximity). The parts are read as one
    table; proximity_asked_twice holds them apart."""
    # Always materialized, even empty: 89_proximity.sql reads it, and an empty
    # table is how it knows that no snapshot was loaded.
    con.execute(
        "CREATE OR REPLACE TABLE raw_proximity (artist_mbid VARCHAR, "
        "neighbours STRUCT(artist_mbid VARCHAR, score INTEGER)[])"
    )
    for part in parts:
        con.execute(
            f'INSERT INTO raw_proximity SELECT artist_mbid, "similar" FROM read_ndjson('
            f"'{part.as_posix()}', columns={RAW_PROXIMITY_COLUMNS}, format='newline_delimited')"
        )
    con.execute(
        "SET VARIABLE proximity_snapshots = "
        + ("NULL" if snapshots is None else f"{[*snapshots]}::DATE[]")
    )


def apply_corrections(con: duckdb.DuckDBPyConnection, corrections: Path | None) -> int:
    if corrections is None:
        # Always materialized, even empty: the fast suite builds
        # fixtures with corrections=None, and the corrections_file_too_large
        # invariant reads this table without depending on the dump.
        con.execute(
            "CREATE OR REPLACE TABLE corrections (mbid VARCHAR, field VARCHAR, "
            "value VARCHAR, justification VARCHAR, source VARCHAR)"
        )
        return 0
    con.execute(
        "CREATE OR REPLACE TABLE corrections AS SELECT * FROM read_csv("
        f"'{corrections.as_posix()}', header=true, "
        "columns={mbid:'VARCHAR', field:'VARCHAR', value:'VARCHAR', "
        "justification:'VARCHAR', source:'VARCHAR'})"
    )
    for field in ("begin", "end"):
        con.execute(
            f'UPDATE raw_artists SET "{field}" = c.value FROM corrections c '
            f"WHERE c.mbid = raw_artists.mbid AND c.field = '{field}'"
        )
    row = con.execute("SELECT count(*) FROM corrections").fetchone()
    assert row is not None  # COUNT(*) always returns exactly one row
    return int(row[0])


def build(
    con: duckdb.DuckDBPyConnection,
    sql_dir: Path,
    artists: Path,
    rgs: Path,
    corrections: Path | None,
    dump_year: int = 2026,
    min_year: int = 1850,
    popularity: Path | None = None,
    popularity_snapshot: str | None = None,
    influences: Path | None = None,
    influences_snapshot: str | None = None,
    discography: Path | None = None,
    discography_snapshot: str | None = None,
    proximity: Sequence[Path] = (),
    proximity_snapshots: Sequence[str] | None = None,
) -> None:
    load_raw(con, artists, rgs)
    apply_corrections(con, corrections)
    load_popularity(con, popularity, popularity_snapshot)
    load_influences(con, influences, influences_snapshot)
    load_discography(con, discography, discography_snapshot)
    load_proximity(con, proximity, proximity_snapshots)
    con.execute(f"SET VARIABLE dump_year = {dump_year}")
    con.execute(f"SET VARIABLE min_year = {min_year}")
    for path in sorted(sql_dir.glob("*.sql")):
        if path.name.startswith("90_"):
            continue
        con.execute(path.read_text(encoding="utf-8"))


INVARIANTS = (
    "duplicate_artist",
    "empty_disambiguation",
    "artist_unexpected_type",
    "special_purpose_artist",
    "begin_misread",
    "birth_misread",
    "artist_out_of_window",
    "end_before_begin",
    "end_after_dump_year",
    "end_before_min_year",
    "y0_source_mismatch",
    "y_end_source_mismatch",
    "first_album_mismatch",
    "last_album_mismatch",
    "album_without_artist",
    "album_out_of_window",
    "album_extra_secondary_type",
    "album_not_an_album",
    "release_unexpected_type",
    "release_without_artist",
    "duplicate_release",
    "release_extra_secondary_type",
    "release_filed_mismatch",
    "release_uncredited",
    "artist_genres_out_of_order",
    "genre_source_mismatch",
    "genres_from_albums_mismatch",
    "unknown_genre",
    "genre_n_artists_mismatch",
    "link_endpoint_missing",
    "link_incomplete",
    "link_unexpected_type",
    "duplicate_link",
    "link_misoriented",
    "url_without_artist",
    "duplicate_url",
    "url_out_of_scope",
    "url_unsourced",
    "duplicate_popularity",
    "popularity_out_of_range",
    "popularity_unrequested",
    "duplicate_influence",
    "influence_malformed",
    "influence_unsourced",
    "proximity_rank_out_of_range",
    "proximity_malformed",
    "proximity_self",
    "proximity_asked_twice",
    "duplicate_proximity",
    "proximity_unsourced",
    "corrections_file_too_large",
    "corrections_invalid",
    "corrections_duplicate",
)


def check_invariants(con: duckdb.DuckDBPyConnection, sql_dir: Path) -> list[tuple[str, int]]:
    con.execute((sql_dir / "90_invariants.sql").read_text(encoding="utf-8"))
    violations: list[tuple[str, int]] = []
    for name in INVARIANTS:
        row = con.execute(f"SELECT count(*) FROM {name}").fetchone()
        assert row is not None  # COUNT(*) always returns exactly one row
        n = int(row[0])
        if n:
            violations.append((name, n))
    return violations
