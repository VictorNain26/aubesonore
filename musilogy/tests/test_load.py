import json

import duckdb
import pytest

from musilogy import cli
from musilogy.fetch import ChecksumError
from musilogy.load import LoadError, load
from musilogy.sample import publish_sample
from tests.conftest import (
    FIX,
    SITE_TABLE,
    hand_over_schemas,
    loaded,
    pg_execute,
    pg_query,
    published,
    synthetic_artist,
)

ME = "00000000-0000-4000-8000-0000000000c0"
A = "00000000-0000-4000-8000-0000000000c1"
B = "00000000-0000-4000-8000-0000000000c2"


def group(mbid):
    return synthetic_artist(mbid, "1978", "1985")


def test_a_new_load_replaces_the_previous_one(tmp_path, pg):
    loaded(tmp_path / "first", pg, [group(ME), group(A)])
    loaded(tmp_path / "second", pg, [group(B)])
    assert pg_query(pg, "SELECT mbid FROM musilogy.artists") == [(B,)]


def test_an_artist_without_a_type_loads(tmp_path, pg):
    # The site's table kept type NOT NULL after the population took every type:
    # the production load of 2026-10-06 stopped on the first untyped artist.
    loaded(tmp_path, pg, [synthetic_artist(ME, None, None, kind=None)])
    assert pg_query(pg, "SELECT mbid, type FROM musilogy.artists") == [(ME, None)]


def test_a_load_that_falls_short_leaves_the_previous_one_in_place(tmp_path, pg):
    # The swap is the point: a staging schema that does not hold the whole
    # delivery must never replace what the site reads.
    loaded(tmp_path / "first", pg, [group(ME)])
    out = published(tmp_path / "second", [group(A), group(B)])
    manifest = json.loads((out / "manifest.json").read_text(encoding="utf-8"))
    manifest["counts"]["artists"] += 1
    (out / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
    with pytest.raises(LoadError):
        load(out, pg)
    assert pg_query(pg, "SELECT mbid FROM musilogy.artists") == [(ME,)]


def test_a_delivery_that_disagrees_with_its_manifest_is_refused(tmp_path):
    # Checked before any connection: no database is needed to refuse it.
    out = published(tmp_path, [group(ME)])
    with (out / "links.parquet").open("ab") as fh:
        fh.write(b"touched")
    with pytest.raises(ChecksumError):
        load(out, "host=unreachable.invalid")


def test_a_role_that_owns_only_its_schemas_loads(tmp_path, pg, roles):
    # The load signs in as its own role, not as the site's: it needs nothing
    # beyond its two schemas.
    loader, _ = roles
    counts = load(published(tmp_path, [group(ME), group(A)]), loader)
    assert counts["artists"] == 2
    assert pg_query(pg, "SELECT count(*) FROM musilogy.artists") == [(2,)]


def test_another_role_reads_what_the_site_reads(tmp_path, roles):
    # Each load recreates the schema: the right to read it is given again at
    # every swap, or the site would lose its pages at the next load.
    loader, reader = roles
    loaded(tmp_path / "first", loader, [group(ME)])
    assert pg_query(reader, f"SELECT count(*) FROM musilogy.artist_card('{ME}')") == [(1,)]
    loaded(tmp_path / "second", loader, [group(A)])
    assert pg_query(reader, f"SELECT count(*) FROM musilogy.artist_card('{A}')") == [(1,)]


def test_the_loading_role_replaces_a_load_made_by_another_role(tmp_path, pg, roles):
    # The first load under the new role finds a schema whose tables still
    # belong to the role that loaded before.
    loader, _ = roles
    loaded(tmp_path / "first", pg, [group(ME)])
    hand_over_schemas(pg)
    loaded(tmp_path / "second", loader, [group(B)])
    assert pg_query(pg, "SELECT mbid FROM musilogy.artists") == [(B,)]


def test_a_reader_cannot_write_what_musilogy_loaded(tmp_path, roles):
    loader, reader = roles
    loaded(tmp_path, loader, [group(ME)])
    with pytest.raises(duckdb.Error, match="permission denied for table artists"):
        pg_execute(reader, "DELETE FROM musilogy.artists")


def test_the_loading_role_cannot_touch_a_table_of_the_site(roles):
    # A load drops a schema with CASCADE: it must hold no right over the
    # accounts and the kept tracks that live in the same database.
    loader, _ = roles
    with pytest.raises(duckdb.Error, match="permission denied for table site_kept"):
        pg_query(loader, f"SELECT * FROM {SITE_TABLE}")
    with pytest.raises(duckdb.Error, match="must be owner of table site_kept"):
        pg_execute(loader, f"DROP TABLE {SITE_TABLE}")


JOY_DIVISION = "9a58fda3-f4ed-4080-a3a5-f457aac9fcdd"


def witness_count():
    with (FIX / "artists.jsonl").open(encoding="utf-8") as fh:
        return sum(1 for _ in fh)


def test_the_sample_is_the_pipeline_run_on_the_fixtures(tmp_path):
    # The small database a workstation develops against: the production code
    # path (build, publish), only fed the versioned witnesses.
    out = publish_sample(tmp_path)
    manifest = json.loads((out / "manifest.json").read_text(encoding="utf-8"))
    witnesses = witness_count()
    assert manifest["counts"]["artists"] == witnesses


def test_load_sample_puts_every_witness_in_the_site_database(pg, monkeypatch):
    # `musilogy load --sample` end to end, the target alone pinned to the
    # disposable Postgres instead of the libpq environment.
    monkeypatch.setattr(cli, "load", lambda out: load(out, pg))
    monkeypatch.setattr("sys.argv", ["musilogy", "load", "--sample"])
    cli.main()
    rows = pg_query(pg, "SELECT mbid::VARCHAR, name FROM musilogy.artists")
    loaded = dict(rows)
    assert set(cli.WITNESSES) <= loaded.keys()
    assert len(loaded) == witness_count()
    assert loaded[JOY_DIVISION] == "Joy Division"
