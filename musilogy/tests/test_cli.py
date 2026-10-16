import json

import pytest

from musilogy import cli
from musilogy.build import RAW_DISCOGS_FIELDS
from musilogy.fetch import ChecksumError, sha256_file
from tests.conftest import FIX


def sidecar(tmp_path, artists_kept, release_groups_kept):
    path = tmp_path / "extraction.json"
    path.write_text(
        json.dumps(
            {
                "artists_kept": artists_kept,
                "artists_dropped": 0,
                "release_groups_kept": release_groups_kept,
                "release_groups_dropped": 0,
            }
        ),
        encoding="utf-8",
    )
    return path


def rows_loaded(con):
    # Read from the connection rather than hardcoded: the fixtures' counts are
    # already frozen in tests/test_fixtures.py, and a second copy here would
    # be a second point of authority that nothing protects.
    return (
        con.execute("SELECT count(*) FROM raw_artists").fetchone()[0],
        con.execute("SELECT count(*) FROM raw_release_groups").fetchone()[0],
    )


def test_a_sidecar_that_disagrees_stops_the_run(con, tmp_path):
    # The failure this exists for: a sidecar left by a wider extraction, which
    # the next run reuses because both JSONL files merely exist. Removing the
    # comparison, or inverting it, makes this test fail.
    with pytest.raises(SystemExit) as raised:
        cli._stop_on_extraction_mismatch(con, sidecar(tmp_path, 1, 1))
    assert "extraction mismatch" in str(raised.value)


def test_no_sidecar_is_not_a_mismatch(con, tmp_path):
    # None means absent, unreadable, or missing a count: silence, not
    # agreement. A truthiness test instead of `is False` would read that
    # silence as a failure and stop every run built on a pre-sidecar
    # extraction — the reference dump's own case today.
    cli._stop_on_extraction_mismatch(con, tmp_path / "absent.json")


def test_a_sidecar_that_agrees_lets_the_run_through(con, tmp_path):
    artists, release_groups = rows_loaded(con)
    cli._stop_on_extraction_mismatch(con, sidecar(tmp_path, artists, release_groups))


def test_run_refuses_to_publish_when_the_extraction_disagrees(tmp_path, monkeypatch):
    # The wiring, not the decision: dropping the call from run(), or moving it
    # back after publish(), leaves the three tests above green. What has to
    # hold is that nothing is written — a mismatching run must not replace a
    # sound delivery in data/out/ with a truncated one. build() and
    # check_invariants() run for real on the fixtures; only publish() is
    # replaced, and the assertion is that it never ran.
    published = []
    monkeypatch.setattr(cli, "ARTISTS_JSONL", FIX / "artists.jsonl")
    monkeypatch.setattr(cli, "RELEASE_GROUPS_JSONL", FIX / "release_groups.jsonl")
    monkeypatch.setattr(cli, "WORK_DIR", tmp_path)
    monkeypatch.setattr(cli, "verified_popularity", lambda: FIX / "popularity.jsonl")
    monkeypatch.setattr(cli, "verified_discography", lambda: FIX / "discography.jsonl")
    monkeypatch.setattr(cli, "verified_official", lambda: [FIX / "official.jsonl"])
    monkeypatch.setattr(cli, "verified_discogs", lambda: FIX / "discogs.jsonl")
    monkeypatch.setattr(cli, "verified_listening", lambda: None)

    def record_publish(*args):
        # Returns a plausible manifest on purpose: a double returning None
        # would make run() die on print(manifest["counts"]) instead, and this
        # test would then fail on a TypeError rather than on the assertion
        # below — failing for the wrong reason is how a test stops describing
        # what it checks.
        published.append(args)
        return {"counts": {}}

    monkeypatch.setattr(cli, "publish", record_publish)
    sidecar(tmp_path, 1, 1)

    with pytest.raises(SystemExit) as raised:
        cli.run()

    assert "extraction mismatch" in str(raised.value)
    assert published == [], "publish() ran before the guard could stop the run"


def test_run_stops_when_the_pinned_snapshot_is_missing(tmp_path, monkeypatch):
    # A snapshot cannot be taken again: run must neither fetch a fresh one,
    # which would publish other counts under the pinned date, nor build
    # without one, which would publish an empty popularity table.
    monkeypatch.setattr(cli, "ARTISTS_JSONL", FIX / "artists.jsonl")
    monkeypatch.setattr(cli, "RELEASE_GROUPS_JSONL", FIX / "release_groups.jsonl")
    monkeypatch.setattr(cli, "POPULARITY_JSONL", tmp_path / "artist-popularity.jsonl")
    with pytest.raises(SystemExit) as raised:
        cli.run()
    assert "cannot be taken again" in str(raised.value)


def test_a_snapshot_already_taken_today_is_never_taken_again(tmp_path, monkeypatch):
    # Taking it again would overwrite the pinned file and its committed digest.
    taken = tmp_path / "artist-popularity.jsonl"
    taken.write_text("", encoding="utf-8")
    monkeypatch.setattr(cli, "ARTISTS_JSONL", FIX / "artists.jsonl")
    monkeypatch.setattr(cli, "popularity_snapshot", lambda _date: taken)
    monkeypatch.setattr(cli, "fetch_popularity", lambda *_: pytest.fail("asked ListenBrainz"))
    with pytest.raises(SystemExit) as raised:
        cli.snapshot_popularity()
    assert "never taken again" in str(raised.value)


def test_run_stops_when_the_pinned_discography_is_missing(tmp_path, monkeypatch):
    # Same contract as the ListenBrainz snapshot: Wikidata moves every day, so
    # a run neither asks it again nor builds without it.
    monkeypatch.setattr(cli, "ARTISTS_JSONL", FIX / "artists.jsonl")
    monkeypatch.setattr(cli, "RELEASE_GROUPS_JSONL", FIX / "release_groups.jsonl")
    monkeypatch.setattr(cli, "verified_popularity", lambda: FIX / "popularity.jsonl")
    monkeypatch.setattr(cli, "DISCOGRAPHY_JSONL", tmp_path / "discography.jsonl")
    with pytest.raises(SystemExit) as raised:
        cli.run()
    assert "cannot be taken again" in str(raised.value)


def test_a_discography_taken_today_is_never_taken_again(tmp_path, monkeypatch):
    taken = tmp_path / "discography.jsonl"
    taken.write_text("", encoding="utf-8")
    monkeypatch.setattr(cli, "discography_snapshot", lambda _date: taken)
    monkeypatch.setattr(cli, "fetch_discography", lambda *_: pytest.fail("asked Wikidata"))
    with pytest.raises(SystemExit) as raised:
        cli.snapshot_discography()
    assert "never taken again" in str(raised.value)


def test_run_stops_when_a_pinned_part_of_a_survey_is_missing(monkeypatch):
    # MusicBrainz moves every day: a run neither asks it again nor builds
    # without every part it pins.
    monkeypatch.setattr(cli, "ARTISTS_JSONL", FIX / "artists.jsonl")
    monkeypatch.setattr(cli, "RELEASE_GROUPS_JSONL", FIX / "release_groups.jsonl")
    monkeypatch.setattr(cli, "verified_popularity", lambda: FIX / "popularity.jsonl")
    monkeypatch.setattr(cli, "verified_discography", lambda: FIX / "discography.jsonl")
    monkeypatch.setattr(cli, "REFERENCE_OFFICIAL", ("1999-01-01",))
    with pytest.raises(SystemExit) as raised:
        cli.run()
    assert "MusicBrainz official status 1999-01-01 missing" in str(raised.value)


def test_a_new_part_of_the_official_survey_asks_only_the_artists_no_part_asked(
    tmp_path, monkeypatch
):
    # An artist is eligible with 500 listeners or more and an album or EP in
    # the extraction; the 5 632 artists with EPs only, missed by the first
    # part, are the reason this exists.
    popularity = tmp_path / "artist-popularity.jsonl"
    popularity.write_text(
        "".join(
            json.dumps({"artist_mbid": m, "total_listen_count": 1, "total_user_count": n}) + "\n"
            for m, n in (("asked", 900), ("eps-only", 600), ("no-record", 900), ("small", 499))
        ),
        encoding="utf-8",
    )
    rgs = tmp_path / "release_groups.jsonl"
    rgs.write_text(
        "".join(json.dumps({"artists": [m]}) + "\n" for m in ("asked", "eps-only", "small")),
        encoding="utf-8",
    )
    first = tmp_path / "first.jsonl"
    first.write_text(
        json.dumps({"artist_mbid": "asked", "release_groups": []}) + "\n", encoding="utf-8"
    )
    monkeypatch.setattr(cli, "RAW_DIR", tmp_path)
    monkeypatch.setattr(cli, "RELEASE_GROUPS_JSONL", rgs)
    monkeypatch.setattr(cli, "verified_popularity", lambda: popularity)
    monkeypatch.setattr(cli, "verified_official", lambda: [first])
    monkeypatch.setattr(cli, "official_snapshot", lambda date: tmp_path / date / "part.jsonl")
    monkeypatch.setattr(cli, "official_sums", lambda date: tmp_path / f"{date}.SHA256SUMS")
    asked = []

    def fetch(mbids, dest):
        asked.extend(mbids)
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text("", encoding="utf-8")
        return len(asked)

    monkeypatch.setattr(cli, "fetch_official", fetch)
    cli.snapshot_official()
    assert asked == ["eps-only"]


def discogs_sidecar(tmp_path, monkeypatch, recorded):
    path = tmp_path / "extraction.json"
    if recorded is not None:
        path.write_text(json.dumps(recorded), encoding="utf-8")
    monkeypatch.setattr(cli, "discogs_extraction", lambda _date: path)
    return path


@pytest.fixture
def extractions(tmp_path, monkeypatch):
    """The Discogs extractions verified_discogs runs, faked: each writes 5 releases."""
    done: list[str] = []
    releases = tmp_path / "releases.jsonl"
    monkeypatch.setattr(cli, "DISCOGS_JSONL", releases)
    monkeypatch.setattr(cli, "fetch_discogs", lambda *_: tmp_path / "dump.xml.gz")

    def extract(_archive, out):
        out.write_text("{}\n", encoding="utf-8")
        done.append(out.name)
        return 5

    monkeypatch.setattr(cli, "extract_discogs", extract)
    return done


def test_a_discogs_projection_of_other_fields_is_extracted_again(
    tmp_path, monkeypatch, extractions
):
    # Breaks if verified_discogs reuses any releases.jsonl that exists: a field
    # added to the projection would then read as nulls in the build.
    (tmp_path / "releases.jsonl").write_text("{}\n", encoding="utf-8")
    sidecar = discogs_sidecar(tmp_path, monkeypatch, {"releases": 5, "fields": ["id"]})
    cli.verified_discogs()
    assert extractions == ["releases.jsonl"]
    assert json.loads(sidecar.read_text(encoding="utf-8")) == {
        "releases": 5,
        "fields": list(RAW_DISCOGS_FIELDS),
    }


def test_a_discogs_projection_of_the_fields_read_is_kept(tmp_path, monkeypatch, extractions):
    (tmp_path / "releases.jsonl").write_text("{}\n", encoding="utf-8")
    discogs_sidecar(tmp_path, monkeypatch, {"releases": 5, "fields": list(RAW_DISCOGS_FIELDS)})
    cli.verified_discogs()
    assert extractions == []


def test_discogs_releases_read_short_of_those_written_stop_the_run(con, tmp_path, monkeypatch):
    (read,) = con.execute("SELECT releases FROM discogs_coverage").fetchone()
    discogs_sidecar(tmp_path, monkeypatch, {"releases": read + 1})
    with pytest.raises(SystemExit) as raised:
        cli._stop_on_discogs_mismatch(con)
    assert "Discogs extraction mismatch" in str(raised.value)

    discogs_sidecar(tmp_path, monkeypatch, {"releases": read})
    cli._stop_on_discogs_mismatch(con)


@pytest.fixture
def pinned_listens(tmp_path, monkeypatch):
    folder = tmp_path / "listens"
    folder.mkdir()
    (folder / "00.parquet").write_bytes(b"slice 0")
    (folder / "01.parquet").write_bytes(b"slice 1")
    sums = tmp_path / "SHA256SUMS"
    sums.write_text(
        # The archive's line is provenance: the archive itself is never kept.
        f"{'f' * 64}  listenbrainz-spark-dump-2692-20261001-000003-full.tar\n"
        f"{sha256_file(folder / '00.parquet')}  00.parquet\n"
        f"{sha256_file(folder / '01.parquet')}  01.parquet\n"
    )
    monkeypatch.setattr(cli, "listening_snapshot", lambda _ref: folder)
    monkeypatch.setattr(cli, "listening_sums", lambda _ref: sums)
    return folder


def test_pinned_listens_are_checked_file_by_file(pinned_listens):
    assert cli.verified_listening() == pinned_listens

    (pinned_listens / "01.parquet").write_bytes(b"tampered")
    with pytest.raises(ChecksumError):
        cli.verified_listening()


@pytest.mark.parametrize(
    "change",
    [
        pytest.param(lambda f: (f / "01.parquet").unlink(), id="slice-missing"),
        pytest.param(lambda f: (f / "02.parquet").write_bytes(b"x"), id="slice-unpinned"),
    ],
)
def test_listens_that_are_not_the_pinned_slices_stop_the_run(pinned_listens, change):
    # An unpinned slice would be read by the build's glob without any check.
    change(pinned_listens)
    with pytest.raises(SystemExit):
        cli.verified_listening()


@pytest.fixture
def spark(tmp_path, monkeypatch):
    """snapshot-listens with the archive replaced: `reduce` stands for the
    reduction of the streamed parts."""
    dest = tmp_path / "listens"
    sums = tmp_path / "SHA256SUMS"
    monkeypatch.setattr(cli, "listening_snapshot", lambda _ref: dest)
    monkeypatch.setattr(cli, "listening_sums", lambda _ref: sums)
    monkeypatch.setattr(cli, "spark_digest", lambda _ref: "a" * 64)
    monkeypatch.setattr(cli, "spark_listens", lambda *_: iter(()))
    monkeypatch.setattr(cli, "connect", lambda: None)

    def reduce(_con, _parts, out):
        (out / "00.parquet").write_bytes(b"slice 0")
        return 1

    monkeypatch.setattr(cli, "reduce_listens", reduce)
    return dest, sums


def test_reduced_listens_are_pinned_with_the_archive_digest(spark):
    dest, sums = spark
    cli.snapshot_listens("2692-20261001-000003")
    assert sums.read_text().splitlines() == [
        f"{'a' * 64}  listenbrainz-spark-dump-2692-20261001-000003-full.tar",
        f"{sha256_file(dest / '00.parquet')}  00.parquet",
    ]


def test_an_archive_that_is_not_the_published_one_stores_nothing(spark, monkeypatch):
    dest, sums = spark

    def reduce(*_):
        raise ChecksumError("not the published archive")

    monkeypatch.setattr(cli, "reduce_listens", reduce)
    with pytest.raises(ChecksumError):
        cli.snapshot_listens("2692-20261001-000003")
    assert not dest.exists()
    assert not sums.exists()


def test_a_stop_before_the_pin_leaves_no_folder_that_looks_reduced(spark, monkeypatch):
    # A folder under its final name refuses a new reduction: it must never
    # exist without the digests the run checks it against.
    dest, _ = spark
    monkeypatch.setattr(cli, "listening_sums", lambda _ref: dest.parent / "missing" / "SUMS")
    with pytest.raises(FileNotFoundError):
        cli.snapshot_listens("2692-20261001-000003")
    assert not dest.exists()


def test_load_sample_hands_the_sample_delivery_to_load(monkeypatch):
    handed = []

    def load(out):
        handed.append((out / "manifest.json").exists())
        return {}

    monkeypatch.setattr(cli, "load", load)
    monkeypatch.setattr("sys.argv", ["musilogy", "load", "--sample"])
    cli.main()
    assert handed == [True]


def test_filter_jsonl_copies_the_kept_lines_byte_for_byte_and_in_order(tmp_path):
    # Fixtures are diffed line by line: a re-serialised record (key order,
    # escaped accents, spacing) would show every line as changed.
    src = tmp_path / "src.jsonl"
    lines = ['{"b": 1, "a": "Björk"}\n', '{"b": 2,"a":"x"}\n', '{"b": 3, "a": "Lethal Shöck"}\n']
    src.write_text("".join(lines), encoding="utf-8")
    dst = tmp_path / "dst.jsonl"
    kept = cli._filter_jsonl(src, dst, lambda r: r["b"] != 2)
    assert dst.read_text(encoding="utf-8") == lines[0] + lines[2]
    assert [r["b"] for r in kept] == [1, 3]


def test_filter_jsonl_keeping_nothing_still_writes_the_file(tmp_path):
    # An empty selection is a result, not an absence: a missing fixture file
    # would make the next build fail on a path, not on its content.
    src = tmp_path / "src.jsonl"
    src.write_text('{"b": 1}\n', encoding="utf-8")
    dst = tmp_path / "dst.jsonl"
    assert cli._filter_jsonl(src, dst, lambda _: False) == []
    assert dst.read_text(encoding="utf-8") == ""


@pytest.mark.parametrize(
    ("argv", "called"),
    [
        (["run"], ("run",)),
        (["snapshot-popularity"], ("snapshot_popularity",)),
        (["snapshot-official"], ("snapshot_official",)),
        (["snapshot-discography"], ("snapshot_discography",)),
        (
            ["snapshot-listens", "2692-20261001-000003"],
            ("snapshot_listens", "2692-20261001-000003"),
        ),
        (["make-fixtures"], ("make_fixtures",)),
        (["load"], ("load_site", False)),
        (["load", "--sample"], ("load_site", True)),
    ],
)
def test_each_command_runs_its_own_handler(monkeypatch, argv, called):
    calls = []
    for name in (
        "run",
        "snapshot_popularity",
        "snapshot_official",
        "snapshot_discography",
        "snapshot_listens",
        "make_fixtures",
        "load_site",
    ):
        monkeypatch.setattr(cli, name, lambda *args, name=name: calls.append((name, *args)))
    monkeypatch.setattr("sys.argv", ["musilogy", *argv])
    cli.main()
    assert calls == [called]


def test_an_unknown_command_is_refused(monkeypatch):
    monkeypatch.setattr("sys.argv", ["musilogy", "publish"])
    with pytest.raises(SystemExit) as raised:
        cli.main()
    assert raised.value.code == 2
