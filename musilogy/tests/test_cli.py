import json

import pytest

from musilogy import REFERENCE_DUMP as DUMP
from musilogy import cli
from musilogy.build import RAW_ARTIST_FIELDS, RAW_DISCOGS_FIELDS, RAW_RG_FIELDS
from musilogy.fetch import ChecksumError, sha256_file
from musilogy.publish import Drift, Trace, counters, delivered, table_counts
from tests.conftest import FIX, delivery_manifest


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


@pytest.fixture
def published_by_run(tmp_path, monkeypatch):
    """run() on the fixtures, delivering under tmp_path/out: build() and
    check_invariants() run for real, publish() is replaced and records its
    calls, so a test can assert it never ran."""
    published = []
    monkeypatch.setattr(cli, "ARTISTS_JSONL", FIX / "artists.jsonl")
    monkeypatch.setattr(cli, "RELEASE_GROUPS_JSONL", FIX / "release_groups.jsonl")
    monkeypatch.setattr(cli, "verified_extraction", lambda: None)
    monkeypatch.setattr(cli, "WORK_DIR", tmp_path)
    monkeypatch.setattr(cli, "verified_popularity", lambda: FIX / "popularity.jsonl")
    monkeypatch.setattr(cli, "verified_discography", lambda: FIX / "discography.jsonl")
    monkeypatch.setattr(cli, "verified_official", lambda: [FIX / "official.jsonl"])
    monkeypatch.setattr(cli, "verified_discogs", lambda: FIX / "discogs.jsonl")
    monkeypatch.setattr(cli, "verified_listening", lambda: None)
    monkeypatch.setattr(cli, "out_dir", lambda dump: tmp_path / "out" / dump)

    def record_publish(*args):
        # Returns a plausible manifest on purpose: a double returning None
        # would make run() die on print(manifest["counts"]) instead, and a
        # test would then fail on a TypeError rather than on its assertion —
        # failing for the wrong reason is how a test stops describing what it
        # checks.
        published.append(args)
        return {"counts": {}}

    monkeypatch.setattr(cli, "publish", record_publish)
    return published


def test_run_refuses_to_publish_when_the_extraction_disagrees(tmp_path, published_by_run):
    # The wiring, not the decision: dropping the call from run(), or moving it
    # back after publish(), leaves the three tests above green. What has to
    # hold is that nothing is written — a mismatching run must not replace a
    # sound delivery in data/out/ with a truncated one.
    published = published_by_run
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
    monkeypatch.setattr(cli, "verified_extraction", lambda: None)
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
    monkeypatch.setattr(cli, "verified_extraction", lambda: None)
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
    monkeypatch.setattr(cli, "verified_extraction", lambda: None)
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


@pytest.fixture
def mb_extractions(tmp_path, monkeypatch):
    """The MusicBrainz extraction run() asks for, its archives faked: each
    extract call writes one record and keeps it."""
    done: list[str] = []
    monkeypatch.setattr(cli, "WORK_DIR", tmp_path)
    monkeypatch.setattr(cli, "ARTISTS_JSONL", tmp_path / "artists.jsonl")
    monkeypatch.setattr(cli, "RELEASE_GROUPS_JSONL", tmp_path / "release_groups.jsonl")
    monkeypatch.setattr(cli, "fetch_dump", lambda _dump, name, *_: tmp_path / name)

    def extract(_archive, _reducer, out):
        out.write_text("{}\n", encoding="utf-8")
        done.append(out.name)
        return 1, 0

    monkeypatch.setattr(cli, "extract", extract)
    for name in ("artists.jsonl", "release_groups.jsonl"):
        (tmp_path / name).write_text("{}\n", encoding="utf-8")
    return done


MB_FIELDS = {"artist_fields": list(RAW_ARTIST_FIELDS), "release_group_fields": list(RAW_RG_FIELDS)}


@pytest.mark.parametrize(
    "recorded",
    [
        pytest.param(None, id="no-sidecar"),
        # An extraction made before the genres were dropped records no fields.
        pytest.param({"artists_kept": 1, "release_groups_kept": 1}, id="no-fields"),
        pytest.param(
            {**MB_FIELDS, "artist_fields": [*RAW_ARTIST_FIELDS, "genres"]}, id="other-fields"
        ),
    ],
)
def test_a_musicbrainz_extraction_of_other_fields_is_extracted_again(
    tmp_path, mb_extractions, recorded
):
    # Breaks if the run reuses any artists.jsonl that exists: one written
    # before the genres were dropped (CC BY-NC-SA, LICENSE-DATA) would carry
    # them into the fixtures make-fixtures copies from it.
    if recorded is not None:
        (tmp_path / "extraction.json").write_text(json.dumps(recorded), encoding="utf-8")
    cli.verified_extraction()
    assert mb_extractions == ["artists.jsonl", "release_groups.jsonl"]
    recorded = json.loads((tmp_path / "extraction.json").read_text(encoding="utf-8"))
    assert {k: recorded[k] for k in MB_FIELDS} == MB_FIELDS
    assert recorded["artists_kept"] == 1


def test_a_musicbrainz_extraction_of_the_fields_read_is_kept(tmp_path, mb_extractions):
    (tmp_path / "extraction.json").write_text(json.dumps(MB_FIELDS), encoding="utf-8")
    cli.verified_extraction()
    assert mb_extractions == []


def test_a_musicbrainz_extraction_missing_a_file_is_extracted_again(tmp_path, mb_extractions):
    (tmp_path / "extraction.json").write_text(json.dumps(MB_FIELDS), encoding="utf-8")
    (tmp_path / "release_groups.jsonl").unlink()
    cli.verified_extraction()
    assert mb_extractions == ["artists.jsonl", "release_groups.jsonl"]


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


def test_load_sample_hands_the_sample_delivery_to_load_then_removes_it(monkeypatch):
    handed = []

    def load(out):
        handed.append((out, (out / "manifest.json").exists()))
        return {}

    monkeypatch.setattr(cli, "load", load)
    monkeypatch.setattr("sys.argv", ["musilogy", "load", "--sample"])
    cli.main()
    [(out, published)] = handed
    assert published
    assert not out.exists()


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
        (["run"], ("run", [])),
        (["run", "--accept-drift", "urls"], ("run", ["urls"])),
        (
            ["run", "--accept-drift", "urls", "--accept-drift", "releases"],
            ("run", ["urls", "releases"]),
        ),
        (
            ["run", "--accept-drift", "link_exclusions.not_on_page"],
            ("run", ["link_exclusions.not_on_page"]),
        ),
        (["run", "--accept-drift", "link_exclusions"], ("run", ["link_exclusions"])),
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


@pytest.mark.parametrize(
    "name",
    [
        "genres",
        "links.not_on_page",
        "link_exclusion.not_on_page",
        "link_exclusion",
        "link_exclusions.",
    ],
)
def test_a_drift_can_only_be_accepted_on_a_table_a_group_or_a_counter_of_a_group(monkeypatch, name):
    # Case: a typo in the table or group name accepted, then matching nothing,
    # so the run stops on the drift it was meant to let through, after hours of
    # build — or a retired table. A counter's own name is checked against the
    # build, in _stop_on_drift: the SQL, not a list here, says which exist.
    monkeypatch.setattr(cli, "run", lambda *_: pytest.fail("ran with an unknown name"))
    monkeypatch.setattr("sys.argv", ["musilogy", "run", "--accept-drift", name])
    with pytest.raises(SystemExit) as raised:
        cli.main()
    assert raised.value.code == 2


def test_an_unknown_command_is_refused(monkeypatch):
    monkeypatch.setattr("sys.argv", ["musilogy", "publish"])
    with pytest.raises(SystemExit) as raised:
        cli.main()
    assert raised.value.code == 2


def test_a_stopped_official_part_resumes_under_the_day_it_started(tmp_path, monkeypatch):
    # A part takes more than a day: the one a stopped run left aside is
    # resumed under its own date, not restarted as today's.
    def snapshot(date):
        return tmp_path / "musicbrainz" / date / "official-release-groups.jsonl"

    left = snapshot("2026-10-03")
    left.parent.mkdir(parents=True)
    left.with_name(left.name + ".partial").write_text("", encoding="utf-8")
    monkeypatch.setattr(cli, "official_snapshot", snapshot)
    monkeypatch.setattr(cli, "RELEASE_GROUPS_JSONL", FIX / "release_groups.jsonl")
    taken = []
    monkeypatch.setattr(cli, "_take_once", lambda _survey, date, *_: taken.append(date))
    cli.snapshot_official()
    assert taken == ["2026-10-03"]


def previous_delivery(folder, manifest):
    return delivery_manifest(folder, **manifest).parent


def moved(con, **changes):
    """The sample's counts and counters, less `changes`: a previous delivery
    that differs from this build by exactly these. A change names a table, or
    a counter as GROUP.COUNTER."""
    manifest = {"counts": table_counts(con), **counters(con)}
    for name, change in changes.items():
        group, _, counter = name.partition(".")
        manifest[group if counter else "counts"][counter or group] -= change
    return manifest


def test_without_a_previous_delivery_the_run_says_it_publishes_uncompared(con, tmp_path, capsys):
    assert cli._stop_on_drift(con, tmp_path / "out" / DUMP, []) == Trace([], {}, {})
    assert "no previous delivery" in capsys.readouterr().out


def test_a_delivery_equal_to_the_previous_goes_through(con, tmp_path, capsys):
    unchanged = previous_delivery(tmp_path / DUMP, moved(con))
    assert cli._stop_on_drift(con, unchanged, []) == Trace([], {}, {})
    assert capsys.readouterr().out == ""


def test_a_drift_stops_the_run_naming_each_table_and_counter_that_moved(con, tmp_path):
    # Expected, got, absolute and relative move: what the reader needs to
    # tell the rule that moved them. What did not move is not named.
    counts = table_counts(con)
    half = counts["artists"] // 2
    not_on_page = delivered(con)["link_exclusions.not_on_page"]
    out = previous_delivery(
        tmp_path / DUMP,
        moved(con, artists=half, urls=-50, **{"link_exclusions.not_on_page": 100}),
    )
    with pytest.raises(SystemExit) as raised:
        cli._stop_on_drift(con, out, [])
    message = str(raised.value)
    assert f"artists: expected {counts['artists'] - half}, got {counts['artists']}, +{half}" in (
        message
    )
    assert f"urls: expected {counts['urls'] + 50}, got {counts['urls']}, -50" in message
    assert (
        f"link_exclusions.not_on_page: expected {not_on_page - 100}, got {not_on_page}, +100"
        in message
    )
    assert "links:" not in message
    assert "to_unextracted_artist" not in message
    assert "nothing published" in message
    assert str(out / "manifest.json") in message


@pytest.mark.parametrize("name", ["urls", "link_exclusions.not_on_page"])
def test_an_accepted_drift_goes_through_is_said_and_returned(con, tmp_path, capsys, name):
    # Returned, because the delivery records it (publish). Case: a counter
    # accepted under its name and still refused.
    out = previous_delivery(tmp_path / DUMP, moved(con, **{name: -50}))
    accepted = cli._stop_on_drift(con, out, [name]).accepted
    assert [d.name for d in accepted] == [name]
    assert accepted[0].absolute == -50
    assert f"drift accepted, {name}: expected" in capsys.readouterr().out


def test_accepting_a_table_that_did_not_move_is_said(con, tmp_path, capsys):
    # Case: the rule meant to move links never took effect, and the run
    # publishes as if the move had been accepted — and records it.
    out = previous_delivery(tmp_path / DUMP, moved(con))
    assert cli._stop_on_drift(con, out, ["links"]).accepted == []
    assert "links did not move" in capsys.readouterr().out


def test_accepting_a_group_lets_through_each_of_its_counters_that_moved(con, tmp_path, capsys):
    # Each is returned under its own name, for the delivery to record it as
    # if it had been named. Case: the group accepted as a whole, its counters
    # then missing from the trace, or the counters of another group let
    # through with it.
    got = delivered(con)
    out = previous_delivery(
        tmp_path / DUMP,
        moved(
            con,
            **{
                "link_exclusions.not_on_page": -50,
                "link_exclusions.to_unextracted_artist": 50,
                "release_status.official": -50,
            },
        ),
    )
    with pytest.raises(SystemExit) as raised:
        cli._stop_on_drift(con, out, ["link_exclusions"])
    assert "release_status.official: expected" in str(raised.value)
    assert "link_exclusions" not in str(raised.value)

    trace = cli._stop_on_drift(con, out, ["link_exclusions", "release_status.official"])
    not_on_page, to_unextracted = (
        got[f"link_exclusions.{name}"] for name in ("not_on_page", "to_unextracted_artist")
    )
    assert trace.accepted == [
        Drift("link_exclusions.not_on_page", not_on_page + 50, not_on_page),
        Drift("link_exclusions.to_unextracted_artist", to_unextracted - 50, to_unextracted),
        Drift(
            "release_status.official",
            got["release_status.official"] + 50,
            got["release_status.official"],
        ),
    ]
    output = capsys.readouterr().out
    assert "drift accepted, link_exclusions.not_on_page: expected" in output
    assert "drift accepted, link_exclusions.to_unextracted_artist: expected" in output


def test_accepting_a_group_none_of_whose_counters_moved_is_said(con, tmp_path, capsys):
    # Case: the rule meant to move the group never took effect, and the run
    # publishes in silence, as for a table accepted that did not move.
    out = previous_delivery(tmp_path / DUMP, moved(con, **{"release_status.official": -50}))
    assert [
        d.name for d in cli._stop_on_drift(con, out, ["link_exclusions", "release_status"]).accepted
    ] == ["release_status.official"]
    output = capsys.readouterr().out
    assert "drift accepted on link_exclusions, but no counter of link_exclusions moved" in output
    assert "release_status, but" not in output


def test_accepting_one_drift_does_not_accept_the_others(con, tmp_path):
    # Case: --accept-drift read as "accept every drift".
    out = previous_delivery(
        tmp_path / DUMP, moved(con, urls=-50, links=-50, **{"release_status.official": -50})
    )
    with pytest.raises(SystemExit) as raised:
        cli._stop_on_drift(con, out, ["urls"])
    assert "links: expected" in str(raised.value)
    assert "release_status.official: expected" in str(raised.value)
    assert "urls: expected" not in str(raised.value)


@pytest.mark.parametrize("previous", [True, False])
def test_accepting_a_counter_the_build_does_not_have_stops_the_run(con, tmp_path, previous):
    # Case: a typo in the counter's name accepted, matching nothing, and the
    # run then publishing a drift it was never told about — or, with nothing
    # to compare, the typo waiting for the next run.
    out = tmp_path / DUMP
    if previous:
        previous_delivery(out, moved(con))
    with pytest.raises(SystemExit) as raised:
        cli._stop_on_drift(con, out, ["link_exclusions.not_on_pages"])
    assert "link_exclusions.not_on_pages" in str(raised.value)
    assert "nothing published" in str(raised.value)


def test_a_counter_the_previous_delivery_did_not_have_is_said_new(con, tmp_path, capsys):
    # Case: a counter added since stopping the run, or passing in silence —
    # or said, and then missing from what the delivery records.
    previous = moved(con)
    birth_future = previous["r2_anomalies"].pop("birth_future")
    out = previous_delivery(tmp_path / DUMP, previous)
    trace = cli._stop_on_drift(con, out, [])
    assert trace == Trace([], {"r2_anomalies.birth_future": birth_future}, {})
    assert f"new counter r2_anomalies.birth_future: {birth_future}" in capsys.readouterr().out


def test_a_counter_the_delivery_no_longer_has_is_said_gone(con, tmp_path, capsys):
    # Case: a counter dropped or renamed in the SQL passing in silence — or
    # said, and then missing from what the delivery records.
    previous = moved(con)
    previous["r2_anomalies"]["begin_retired"] = 7
    out = previous_delivery(tmp_path / DUMP, previous)
    assert cli._stop_on_drift(con, out, []) == Trace([], {}, {"r2_anomalies.begin_retired": 7})
    assert "counter gone r2_anomalies.begin_retired, was 7" in capsys.readouterr().out


def test_accepting_a_counter_gone_since_stops_the_run(con, tmp_path):
    # Case: a stale name, renamed in the SQL since, accepted and doing nothing
    # while the counter it became goes uncompared.
    previous = moved(con)
    previous["r2_anomalies"]["begin_retired"] = 7
    out = previous_delivery(tmp_path / DUMP, previous)
    with pytest.raises(SystemExit) as raised:
        cli._stop_on_drift(con, out, ["r2_anomalies.begin_retired"])
    assert "r2_anomalies.begin_retired" in str(raised.value)


def test_accepting_a_new_counter_says_it_is_new(con, tmp_path, capsys):
    # Case: told it "did not move", when it was never compared at all.
    previous = moved(con)
    del previous["r2_anomalies"]["birth_future"]
    out = previous_delivery(tmp_path / DUMP, previous)
    assert cli._stop_on_drift(con, out, ["r2_anomalies.birth_future"]).accepted == []
    output = capsys.readouterr().out
    assert "r2_anomalies.birth_future is new, nothing to accept" in output
    assert "did not move" not in output


def test_run_compares_with_the_previous_delivery_before_overwriting_it(
    con, tmp_path, published_by_run
):
    # Case: the guard dropped from run(), moved after publish() — which
    # overwrites the very manifest it compares with —, or handed another
    # directory than the one publish() writes.
    published = published_by_run
    artists = table_counts(con)["artists"]
    previous_delivery(tmp_path / "out" / DUMP, moved(con, artists=artists - 1))

    with pytest.raises(SystemExit) as raised:
        cli.run([])
    assert "artists: expected 1," in str(raised.value)
    assert "links:" not in str(raised.value)
    assert published == [], "publish() ran before the comparison could stop the run"

    # The same run, the drift accepted: it publishes, where it compared, and
    # hands publish() what it compared, for the manifest to record.
    cli.run(["artists"])
    assert [args[1] for args in published] == [tmp_path / "out" / DUMP]
    assert [args[4] for args in published] == [Trace([Drift("artists", 1, artists)], {}, {})]
