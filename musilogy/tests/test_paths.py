import pytest

from musilogy.paths import (
    DATA_DIR,
    FIXTURES_DIR,
    PACKAGE_DIR,
    RAW_DIR,
    aside_of,
    discogs_extraction,
    discogs_releases,
    dump_sums,
    extraction_sidecar,
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


def test_data_paths_never_depend_on_the_current_directory():
    for path in (DATA_DIR, RAW_DIR, FIXTURES_DIR, work_dir("d"), out_dir("d")):
        assert path.is_absolute(), path


def test_the_data_directory_sits_beside_the_package_not_under_it():
    # data/ is a sibling of src/, never inside the installed package: a path
    # rooted on PACKAGE_DIR would write outputs into the source tree.
    assert PACKAGE_DIR not in DATA_DIR.parents
    assert DATA_DIR.name == "data"


def test_the_dump_digests_are_named_after_the_dump():
    assert dump_sums("20260909-001002").name == "20260909-001002.SHA256SUMS"
    assert dump_sums("20260909-001002") != dump_sums("20270101-000000")


def test_an_extraction_sidecar_sits_beside_its_extraction():
    # The MusicBrainz and the Discogs extractions share the sidecar's name: a
    # build reads each beside its own extraction, never one for the other.
    assert extraction_sidecar(work_dir("d")).parent == work_dir("d")
    assert discogs_extraction("2026-10-01").parent == discogs_releases("2026-10-01").parent
    assert discogs_extraction("2026-10-01") != extraction_sidecar(work_dir("2026-10-01"))


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
