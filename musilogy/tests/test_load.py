import json

import pytest
from conftest import loaded, pg_query, published, synthetic_artist

from musilogy.fetch import ChecksumError
from musilogy.load import LoadError, load

ME = "00000000-0000-4000-8000-0000000000c0"
A = "00000000-0000-4000-8000-0000000000c1"
B = "00000000-0000-4000-8000-0000000000c2"


def group(mbid):
    return synthetic_artist(mbid, "1978", "1985")


def test_a_new_load_replaces_the_previous_one(tmp_path, pg):
    loaded(tmp_path / "first", pg, [group(ME), group(A)])
    loaded(tmp_path / "second", pg, [group(B)])
    assert pg_query(pg, "SELECT mbid FROM musilogy.artists") == [(B,)]


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
