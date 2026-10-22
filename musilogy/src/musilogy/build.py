"""Chains the transformation SQL files on a DuckDB connection."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from pathlib import Path

import duckdb

from musilogy.colisten import build_colisten, set_parameters
from musilogy.paths import DATA_DIR, written_aside
from musilogy.samesound import build_same_sound


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


# The fields each input is read with: the columns read_ndjson parses and the
# empty table a build without that input materializes come from one dict.
RAW_ARTIST_FIELDS = {
    "mbid": "VARCHAR",
    "name": "VARCHAR",
    "disambiguation": "VARCHAR",
    "type": "VARCHAR",
    "begin": "VARCHAR",
    "end": "VARCHAR",
    "ended": "BOOLEAN",
    "country": "VARCHAR",
    "begin_area": "VARCHAR",
    "begin_area_mbid": "VARCHAR",
    "relations": (
        'STRUCT(type VARCHAR, direction VARCHAR, mbid VARCHAR, begin VARCHAR, "end" VARCHAR)[]'
    ),
    "urls": "STRUCT(type VARCHAR, url VARCHAR, ended BOOLEAN)[]",
}
RAW_RG_FIELDS = {
    "mbid": "VARCHAR",
    "title": "VARCHAR",
    "primary_type": "VARCHAR",
    "date": "VARCHAR",
    "secondary": "VARCHAR[]",
    "artists": "VARCHAR[]",
}
RAW_POPULARITY_FIELDS = {
    "artist_mbid": "VARCHAR",
    "total_listen_count": "BIGINT",
    "total_user_count": "BIGINT",
}
RAW_DISCOGRAPHY_FIELDS = {"rg_mbid": "VARCHAR", "form": "VARCHAR"}
RAW_OFFICIAL_FIELDS = {"artist_mbid": "VARCHAR", "release_groups": "VARCHAR[]"}
# The fields extract.reduce_discogs_release writes, in its order.
RAW_DISCOGS_FIELDS = {
    "id": "BIGINT",
    "master_id": "BIGINT",
    "artists": "BIGINT[]",
    "descriptions": "VARCHAR[]",
    "styles": "VARCHAR[]",
    "released": "VARCHAR",
}


def ndjson(fields: Mapping[str, str], path: str = "?") -> str:
    """A read_ndjson of `fields`, every name quoted ("end" is a keyword), its
    path a parameter unless given as a literal."""
    columns = ", ".join(f"\"{name}\": '{kind}'" for name, kind in fields.items())
    return f"read_ndjson({path}, columns={{{columns}}}, format='newline_delimited')"


def _load_ndjson(
    con: duckdb.DuckDBPyConnection, table: str, path: Path, fields: Mapping[str, str]
) -> None:
    con.execute(
        f"CREATE OR REPLACE TABLE {table} AS SELECT * FROM {ndjson(fields)}", [path.as_posix()]
    )


def _create_empty(con: duckdb.DuckDBPyConnection, table: str, fields: Mapping[str, str]) -> None:
    columns = ", ".join(f'"{name}" {kind}' for name, kind in fields.items())
    con.execute(f"CREATE OR REPLACE TABLE {table} ({columns})")


def _set_variable(con: duckdb.DuckDBPyConnection, name: str, value: object, kind: str) -> None:
    con.execute(f"SET VARIABLE {name} = ?::{kind}", [value])


def load_raw(con: duckdb.DuckDBPyConnection, artists: Path, rgs: Path) -> None:
    _load_ndjson(con, "raw_artists", artists, RAW_ARTIST_FIELDS)
    _load_ndjson(con, "raw_release_groups", rgs, RAW_RG_FIELDS)


def load_popularity(
    con: duckdb.DuckDBPyConnection, popularity: Path | None, snapshot: str | None
) -> None:
    if popularity is None:
        # Always materialized, even empty: synthetic builds
        # carry no snapshot, and 87_popularity.sql reads this table anyway.
        _create_empty(con, "raw_popularity", RAW_POPULARITY_FIELDS)
    else:
        _load_ndjson(con, "raw_popularity", popularity, RAW_POPULARITY_FIELDS)
    _set_variable(con, "popularity_snapshot", snapshot, "DATE")


def load_discography(
    con: duckdb.DuckDBPyConnection, discography: Path | None, snapshot: str | None
) -> None:
    if discography is None:
        # Always materialized, even empty, like popularity: synthetic builds
        # carry no snapshot, and 22_releases.sql reads this table anyway.
        _create_empty(con, "raw_discography", RAW_DISCOGRAPHY_FIELDS)
    else:
        _load_ndjson(con, "raw_discography", discography, RAW_DISCOGRAPHY_FIELDS)
    _set_variable(con, "discography_snapshot", snapshot, "DATE")


def load_listening(
    con: duckdb.DuckDBPyConnection, listens: Path | None, snapshot: str | None
) -> None:
    """Who listens to whom, from the ListenBrainz listens reduced to one row per
    user and artist (extract.reduce_listens); how often does not count."""
    # Always materialized, even empty: colisten reads it. 120 million rows:
    # leaving the insertion order free while they are read keeps them within
    # the build's memory bound (nothing reads this table in order; publish()
    # sorts every table it writes).
    con.execute("CREATE OR REPLACE TABLE raw_listening (user_id INTEGER, artist_mbid UUID)")
    if listens is not None:
        con.execute("SET preserve_insertion_order = false")
        con.execute(
            "INSERT INTO raw_listening SELECT user_id, artist_mbid FROM read_parquet(?)",
            [(listens / "*.parquet").as_posix()],
        )
        con.execute("RESET preserve_insertion_order")
    _set_variable(con, "listening_snapshot", snapshot, "VARCHAR")


def colisten_from(
    con: duckdb.DuckDBPyConnection,
    listens: Path | None,
    snapshot: str | None,
    cache: Path | None,
) -> None:
    """The co-listening, read from `cache` when a run already computed it,
    else computed from the listens and kept at `cache`. The cache's path names
    the listens and the rule (paths.colisten_cache): what it holds is what the
    computation would give. A build without listens neither reads nor keeps one."""
    if cache is None or listens is None or not cache.exists():
        load_listening(con, listens, snapshot)
        build_colisten(con)
        if cache is None or listens is None:
            return
        with written_aside(cache) as aside:
            con.execute("COPY colisten TO ? (FORMAT parquet, COMPRESSION zstd)", [aside.as_posix()])
        con.execute("DROP TABLE colisten")
    else:
        set_parameters(con)
        _set_variable(con, "listening_snapshot", snapshot, "VARCHAR")
    # Once kept, the table is its file: seven million rows held in the build's
    # capped memory would push later steps to spill. A view takes no prepared
    # parameter: the path goes in as a literal.
    literal = "'" + cache.as_posix().replace("'", "''") + "'"
    con.execute(f"CREATE OR REPLACE VIEW colisten AS SELECT * FROM read_parquet({literal})")


def load_official(
    con: duckdb.DuckDBPyConnection, parts: Sequence[Path], snapshots: Sequence[str] | None
) -> None:
    """The album and EP release groups MusicBrainz shows for each artist asked,
    in parts, each asking the artists no earlier part asked; NULL for an artist
    it no longer holds or answered as merged (fetch.official_release_groups)."""
    # Always materialized, even empty: 22_releases.sql reads it, and an empty
    # table leaves every record's status unknown.
    _create_empty(con, "raw_official", RAW_OFFICIAL_FIELDS)
    for part in parts:
        con.execute(
            f"INSERT INTO raw_official SELECT * FROM {ndjson(RAW_OFFICIAL_FIELDS)}",
            [part.as_posix()],
        )
    _set_variable(con, "official_snapshots", None if snapshots is None else [*snapshots], "DATE[]")


def load_discogs(con: duckdb.DuckDBPyConnection, releases: Path | None, dump: str | None) -> None:
    """A view, not a table: 84_discogs.sql reads the 19 million releases once,
    as a stream, into the narrower discogs_work."""
    if releases is None:
        # Always materialized, even empty: 84_discogs.sql reads it.
        _create_empty(con, "raw_discogs", RAW_DISCOGS_FIELDS)
    else:
        # A view takes no prepared parameter: the path goes in as a literal.
        literal = "'" + releases.as_posix().replace("'", "''") + "'"
        reader = ndjson(RAW_DISCOGS_FIELDS, literal)
        con.execute(f"CREATE OR REPLACE VIEW raw_discogs AS SELECT * FROM {reader}")
    _set_variable(con, "discogs_dump", dump, "VARCHAR")


def build(
    con: duckdb.DuckDBPyConnection,
    sql_dir: Path,
    artists: Path,
    rgs: Path,
    dump_year: int = 2026,
    min_year: int = 1850,
    popularity: Path | None = None,
    popularity_snapshot: str | None = None,
    discography: Path | None = None,
    discography_snapshot: str | None = None,
    official: Sequence[Path] = (),
    official_snapshots: Sequence[str] | None = None,
    discogs: Path | None = None,
    discogs_dump: str | None = None,
    listening: Path | None = None,
    listening_snapshot: str | None = None,
    colisten_cache: Path | None = None,
) -> None:
    load_raw(con, artists, rgs)
    load_popularity(con, popularity, popularity_snapshot)
    load_discography(con, discography, discography_snapshot)
    load_official(con, official, official_snapshots)
    load_discogs(con, discogs, discogs_dump)
    colisten_from(con, listening, listening_snapshot, colisten_cache)
    _set_variable(con, "dump_year", dump_year, "INTEGER")
    _set_variable(con, "min_year", min_year, "INTEGER")
    for path in sorted(sql_dir.glob("*.sql")):
        if path.name.startswith("90_"):
            continue
        con.execute(path.read_text(encoding="utf-8"))
    # « Même son » reads the styles of 84_discogs.sql.
    build_same_sound(con)


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
    "duplicate_colisten",
    "colisten_self",
    "colisten_rank_out_of_range",
    "colisten_below_min_common",
    "colisten_out_of_order",
    "duplicate_same_sound",
    "same_sound_self",
    "same_sound_rank_out_of_range",
    "same_sound_out_of_order",
    "same_sound_score_out_of_range",
    "same_sound_unexplained",
    "duplicate_credit",
    "credit_self",
    "credit_one_way",
    "credit_without_record",
    "credit_linked",
    "official_asked_twice",
    "official_unsourced",
    "duplicate_style",
    "artist_styles_mismatch",
    "style_without_artist",
    "style_decade_malformed",
    "discogs_link_ambiguous",
)


def scalar(con: duckdb.DuckDBPyConnection, sql: str, params: Sequence[object] = ()) -> int:
    """The one integer an aggregate query returns, such as a COUNT(*)."""
    row = con.execute(sql, params).fetchone()
    assert row is not None  # an aggregate without GROUP BY returns exactly one row
    return int(row[0])


def check_invariants(con: duckdb.DuckDBPyConnection, sql_dir: Path) -> list[tuple[str, int]]:
    con.execute((sql_dir / "90_invariants.sql").read_text(encoding="utf-8"))
    violations: list[tuple[str, int]] = []
    for name in INVARIANTS:
        n = scalar(con, f"SELECT count(*) FROM {name}")
        if n:
            violations.append((name, n))
    return violations
