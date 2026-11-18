import os

import pytest

from musilogy.build import connect
from musilogy.paths import (
    DATA_DIR,
    aside_of,
    out_dir,
    work_dir,
    written_aside,
)


def test_the_extraction_directory_carries_the_dump_it_came_from():
    # The trap this closes: `musilogy run` reusing a previous dump's extraction
    # and publishing a manifest that names the new dump and its checksums. A
    # work directory that ignores its argument makes the two indistinguishable.
    assert work_dir("20260909-001002") != work_dir("20270101-000000")
    assert work_dir("20260909-001002").name == "20260909-001002"
    assert out_dir("20260909-001002").name == "20260909-001002"


def test_a_file_written_aside_appears_only_once_whole(tmp_path):
    dest = tmp_path / "deep" / "snapshot.jsonl"
    with written_aside(dest) as aside:
        aside.write_text("whole\n", encoding="utf-8")
        assert not dest.exists()
    assert dest.read_text(encoding="utf-8") == "whole\n"
    assert not aside_of(dest).exists()


def test_a_write_cut_short_leaves_only_its_partial(tmp_path):
    # Breaks if the rename runs on an error: the next run would take a
    # truncated file for a whole one and skip it.
    dest = tmp_path / "snapshot.jsonl"

    def cut_short():
        with written_aside(dest) as aside:
            aside.write_text("half", encoding="utf-8")
            raise TimeoutError

    with pytest.raises(TimeoutError):
        cut_short()
    assert not dest.exists()
    assert aside_of(dest).read_text(encoding="utf-8") == "half"


def test_a_folder_can_be_written_aside(tmp_path):
    # snapshot-listens writes a folder of slices this way.
    dest = tmp_path / "listens-ref"
    with written_aside(dest) as aside:
        aside.mkdir()
        (aside / "00.parquet").write_bytes(b"x")
    assert (dest / "00.parquet").read_bytes() == b"x"


def test_each_build_spills_into_its_own_folder():
    # Two DuckDB processes spilling into one folder name their files alike:
    # the one that closed first deleted the other's, which failed after
    # eleven hours (2026-10-22). Each connection spills into a folder of its
    # own, under the data's tmp/, which DuckDB removes on close.
    folder = connect().execute("SELECT current_setting('temp_directory')").fetchone()
    assert folder is not None
    assert folder[0] == (DATA_DIR / "tmp" / f"duckdb-{os.getpid()}").as_posix()
