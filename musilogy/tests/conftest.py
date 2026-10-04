import json
import os
from pathlib import Path
from typing import Any

import duckdb
import pytest

from musilogy import REFERENCE_DUMP, REFERENCE_INFLUENCES, REFERENCE_POPULARITY
from musilogy.build import build
from musilogy.load import load
from musilogy.paths import SQL_DIR
from musilogy.publish import publish

FIX = Path(__file__).parent / "fixtures"
SQL = SQL_DIR


@pytest.fixture(scope="module")
def con():
    c = duckdb.connect(":memory:")
    build(
        c,
        SQL,
        FIX / "artists.jsonl",
        FIX / "release_groups.jsonl",
        None,
        popularity=FIX / "popularity.jsonl",
        popularity_snapshot=REFERENCE_POPULARITY,
        influences=FIX / "influences.jsonl",
        influences_snapshot=REFERENCE_INFLUENCES,
    )
    return c


# Synthetic records, for the date shapes the witnesses do not carry (a begin
# below the floor, an end in 1537...). They validate a rule against a shape,
# never the source itself: anything a real witness can show is tested on the
# fixtures instead.
def synthetic_artist(
    mbid: str,
    begin: str | None,
    end: str | None,
    relations: list[dict[str, Any]] | None = None,
    genres: list[dict[str, Any]] | None = None,
    name: str | None = None,
    kind: str = "Group",
    country: str | None = None,
    begin_area: tuple[str, str] | None = None,
) -> dict[str, Any]:
    return {
        "mbid": mbid,
        "name": name or mbid,
        "type": kind,
        "begin": begin,
        "end": end,
        "ended": end is not None,
        "country": country,
        "begin_area": begin_area[1] if begin_area else None,
        "begin_area_mbid": begin_area[0] if begin_area else None,
        "genres": genres or [],
        "relations": relations or [],
    }


def synthetic_release_group(
    mbid: str,
    artist: str,
    date: str,
    secondary: list[str] | None = None,
    co_artists: list[str] | None = None,
    genres: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    return {
        "mbid": mbid,
        "title": mbid,
        "date": date,
        "secondary": secondary or [],
        "artists": [artist, *(co_artists or [])],
        "genres": genres or [],
    }


def build_synthetic(tmp_path, artists, release_groups=(), **build_kwargs):
    artists_path = tmp_path / "artists.jsonl"
    rgs_path = tmp_path / "release_groups.jsonl"
    artists_path.write_text("".join(json.dumps(a) + "\n" for a in artists), encoding="utf-8")
    rgs_path.write_text("".join(json.dumps(r) + "\n" for r in release_groups), encoding="utf-8")
    c = duckdb.connect(":memory:")
    build(c, SQL, artists_path, rgs_path, None, **build_kwargs)
    return c


@pytest.fixture
def pg():
    """A libpq connection string to a disposable Postgres, never the site's:
    the tests drop and recreate the musilogy schemas. The CI provides one; a
    run without it skips these tests, except in the CI, where a skip would
    hide that they stopped running."""
    conninfo = os.environ.get("MUSILOGY_TEST_PG")
    if not conninfo:
        if os.environ.get("CI"):
            pytest.fail("MUSILOGY_TEST_PG is unset in the CI")
        pytest.skip("MUSILOGY_TEST_PG unset: no disposable Postgres")
    return conninfo


def influences_file(path, rows):
    """A synthetic Wikidata snapshot: (artist, influence, statement) rows."""
    path.write_text(
        "".join(
            json.dumps({"artist_mbid": a, "influence_mbid": i, "statement": s}) + "\n"
            for a, i, s in rows
        ),
        encoding="utf-8",
    )
    return path


def published(tmp_path, artists, popularity=None, influences=None):
    """A synthetic build, published as a delivery. `popularity` maps an mbid
    to its listen count; every other artist gets the null row ListenBrainz
    sends for an artist it has no listen of, as a real snapshot asks about
    everyone. `influences` lists (artist, influence, statement) rows."""
    tmp_path.mkdir(exist_ok=True)
    kwargs: dict[str, Any] = {}
    if popularity is not None:
        path = tmp_path / "popularity.jsonl"
        path.write_text(
            "".join(
                json.dumps(
                    {
                        "artist_mbid": a["mbid"],
                        "total_listen_count": popularity.get(a["mbid"]),
                        "total_user_count": popularity.get(a["mbid"]),
                    }
                )
                + "\n"
                for a in artists
            ),
            encoding="utf-8",
        )
        kwargs = {"popularity": path, "popularity_snapshot": REFERENCE_POPULARITY}
    if influences is not None:
        kwargs["influences"] = influences_file(tmp_path / "influences.jsonl", influences)
        kwargs["influences_snapshot"] = REFERENCE_INFLUENCES
    out = tmp_path / "out"
    publish(build_synthetic(tmp_path, artists, **kwargs), out, REFERENCE_DUMP, None)
    return out


def pg_query(conninfo, sql):
    con = duckdb.connect()
    con.execute("LOAD postgres")
    escaped = conninfo.replace("'", "''")
    con.execute(f"ATTACH '{escaped}' AS pg (TYPE postgres, READ_ONLY)")
    return con.execute("SELECT * FROM postgres_query('pg', ?)", [sql]).fetchall()


def loaded(tmp_path, conninfo, artists, popularity=None, influences=None):
    load(published(tmp_path, artists, popularity, influences), conninfo)
    return conninfo
