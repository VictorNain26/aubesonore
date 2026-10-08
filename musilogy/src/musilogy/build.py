"""Chains the transformation SQL files on a DuckDB connection."""

from __future__ import annotations

from collections.abc import Sequence
from pathlib import Path

import duckdb

from musilogy.colisten import build_colisten
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


RAW_DISCOGRAPHY_COLUMNS = "{rg_mbid:'VARCHAR', form:'VARCHAR'}"


def load_discography(
    con: duckdb.DuckDBPyConnection, discography: Path | None, snapshot: str | None
) -> None:
    if discography is None:
        # Always materialized, even empty, like popularity: synthetic builds
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


RAW_LISTENING_COLUMNS = (
    "{user_id:'BIGINT', "
    "data:'STRUCT(listen_count BIGINT, artist_name VARCHAR, artist_mbid VARCHAR)[]'}"
)


def load_listening(
    con: duckdb.DuckDBPyConnection, export: Path | None, snapshot: str | None
) -> None:
    """Who listens to whom, from the ListenBrainz statistics export: each
    user's top artists of all time, one row per user and artist with an MBID
    (an artist known only by name cannot be counted). Read with a bounded
    object size: a user's line holds up to a thousand artists."""
    # Always materialized, even empty: colisten reads it. 33 million rows: the
    # MBID as a UUID (16 bytes rather than 36 characters, and a malformed one
    # stops the build) keeps them within the build's memory bound, and so does
    # leaving the insertion order free while they are read (nothing reads this
    # table in order; publish() sorts every table it writes).
    con.execute("CREATE OR REPLACE TABLE raw_listening (user_id INTEGER, artist_mbid UUID)")
    if export is not None:
        con.execute("SET preserve_insertion_order = false")
        con.execute(
            "INSERT INTO raw_listening "
            "SELECT user_id, d.artist_mbid::UUID FROM ("
            f"  SELECT user_id, unnest(data) AS d FROM read_ndjson('{export.as_posix()}', "
            f"    columns={RAW_LISTENING_COLUMNS}, format='newline_delimited', "
            "    maximum_object_size=268435456)"
            ") WHERE d.artist_mbid IS NOT NULL"
        )
        con.execute("RESET preserve_insertion_order")
    con.execute(
        "SET VARIABLE listening_snapshot = " + ("NULL" if snapshot is None else f"'{snapshot}'")
    )


def load_official(
    con: duckdb.DuckDBPyConnection, parts: Sequence[Path], snapshots: Sequence[str] | None
) -> None:
    """The album and EP release groups MusicBrainz shows for each artist asked,
    in parts like the proximity; NULL for an artist it no longer holds or
    answered as merged (fetch.official_release_groups)."""
    # Always materialized, even empty: 22_releases.sql reads it, and an empty
    # table leaves every record's status unknown.
    con.execute(
        "CREATE OR REPLACE TABLE raw_official (artist_mbid VARCHAR, release_groups VARCHAR[])"
    )
    for part in parts:
        con.execute(
            f"INSERT INTO raw_official SELECT artist_mbid, release_groups FROM read_ndjson("
            f"'{part.as_posix()}', columns={{artist_mbid:'VARCHAR', release_groups:'VARCHAR[]'}}, "
            "format='newline_delimited')"
        )
    con.execute(
        "SET VARIABLE official_snapshots = "
        + ("NULL" if snapshots is None else f"{[*snapshots]}::DATE[]")
    )


# The fields extract.reduce_discogs_release writes, in its order.
RAW_DISCOGS_FIELDS = {
    "id": "BIGINT",
    "master_id": "BIGINT",
    "artists": "BIGINT[]",
    "descriptions": "VARCHAR[]",
    "styles": "VARCHAR[]",
    "released": "VARCHAR",
}
RAW_DISCOGS_COLUMNS = "{" + ", ".join(f"{k}:'{v}'" for k, v in RAW_DISCOGS_FIELDS.items()) + "}"


def load_discogs(con: duckdb.DuckDBPyConnection, releases: Path | None, dump: str | None) -> None:
    """A view, not a table: 84_discogs.sql reads the 19 million releases once,
    as a stream, into the narrower discogs_work."""
    if releases is None:
        # Always materialized, even empty: 84_discogs.sql reads it.
        con.execute(
            "CREATE OR REPLACE TABLE raw_discogs (id BIGINT, master_id BIGINT, artists BIGINT[], "
            "descriptions VARCHAR[], styles VARCHAR[], released VARCHAR)"
        )
    else:
        con.execute(
            f"CREATE OR REPLACE VIEW raw_discogs AS SELECT * FROM read_ndjson("
            f"'{releases.as_posix()}', columns={RAW_DISCOGS_COLUMNS}, "
            f"format='newline_delimited')"
        )
    con.execute("SET VARIABLE discogs_dump = " + ("NULL" if dump is None else f"'{dump}'"))


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
    discography: Path | None = None,
    discography_snapshot: str | None = None,
    proximity: Sequence[Path] = (),
    proximity_snapshots: Sequence[str] | None = None,
    official: Sequence[Path] = (),
    official_snapshots: Sequence[str] | None = None,
    discogs: Path | None = None,
    discogs_dump: str | None = None,
    listening: Path | None = None,
    listening_snapshot: str | None = None,
) -> None:
    load_raw(con, artists, rgs)
    apply_corrections(con, corrections)
    load_popularity(con, popularity, popularity_snapshot)
    load_discography(con, discography, discography_snapshot)
    load_proximity(con, proximity, proximity_snapshots)
    load_official(con, official, official_snapshots)
    load_discogs(con, discogs, discogs_dump)
    load_listening(con, listening, listening_snapshot)
    build_colisten(con)
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
    "proximity_rank_out_of_range",
    "proximity_malformed",
    "proximity_self",
    "proximity_asked_twice",
    "duplicate_proximity",
    "proximity_unsourced",
    "duplicate_colisten",
    "colisten_self",
    "colisten_rank_out_of_range",
    "colisten_below_min_common",
    "colisten_out_of_order",
    "duplicate_same_sound",
    "same_sound_self",
    "same_sound_rank_out_of_range",
    "same_sound_out_of_order",
    "same_sound_unsourced",
    "same_sound_colour_out_of_range",
    "same_sound_unexplained",
    "official_asked_twice",
    "official_unsourced",
    "duplicate_style",
    "style_without_artist",
    "style_decade_malformed",
    "discogs_link_ambiguous",
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
