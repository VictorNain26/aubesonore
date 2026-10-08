import json

import pytest
from conftest import FIX

from musilogy import cli
from musilogy.build import RAW_DISCOGS_FIELDS


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
    monkeypatch.setattr(cli, "verified_influences", lambda: FIX / "influences.jsonl")
    monkeypatch.setattr(cli, "verified_discography", lambda: FIX / "discography.jsonl")
    monkeypatch.setattr(cli, "verified_proximity", lambda: [FIX / "proximity.jsonl"])
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


def test_run_stops_when_the_pinned_influences_are_missing(tmp_path, monkeypatch):
    # Same contract as the ListenBrainz snapshot: Wikidata moves every day, so
    # a run neither asks it again nor builds without it.
    monkeypatch.setattr(cli, "ARTISTS_JSONL", FIX / "artists.jsonl")
    monkeypatch.setattr(cli, "RELEASE_GROUPS_JSONL", FIX / "release_groups.jsonl")
    monkeypatch.setattr(cli, "verified_popularity", lambda: FIX / "popularity.jsonl")
    monkeypatch.setattr(cli, "INFLUENCES_JSONL", tmp_path / "influences.jsonl")
    with pytest.raises(SystemExit) as raised:
        cli.run()
    assert "cannot be taken again" in str(raised.value)


def test_influences_taken_today_are_never_taken_again(tmp_path, monkeypatch):
    taken = tmp_path / "influences.jsonl"
    taken.write_text("", encoding="utf-8")
    monkeypatch.setattr(cli, "influences_snapshot", lambda _date: taken)
    monkeypatch.setattr(cli, "fetch_influences", lambda *_: pytest.fail("asked Wikidata"))
    with pytest.raises(SystemExit) as raised:
        cli.snapshot_influences()
    assert "never taken again" in str(raised.value)


def test_run_stops_when_a_pinned_part_of_the_proximity_is_missing(monkeypatch):
    # The neighbours change with every listening day: a run neither asks
    # ListenBrainz again nor builds without every part it pins.
    monkeypatch.setattr(cli, "ARTISTS_JSONL", FIX / "artists.jsonl")
    monkeypatch.setattr(cli, "RELEASE_GROUPS_JSONL", FIX / "release_groups.jsonl")
    monkeypatch.setattr(cli, "verified_popularity", lambda: FIX / "popularity.jsonl")
    monkeypatch.setattr(cli, "verified_influences", lambda: FIX / "influences.jsonl")
    monkeypatch.setattr(cli, "verified_discography", lambda: FIX / "discography.jsonl")
    monkeypatch.setattr(cli, "REFERENCE_PROXIMITY", ("1999-01-01",))
    with pytest.raises(SystemExit) as raised:
        cli.run()
    assert "ListenBrainz proximity 1999-01-01 missing" in str(raised.value)


def test_a_new_part_of_the_proximity_asks_only_the_artists_no_part_asked(tmp_path, monkeypatch):
    popularity = tmp_path / "artist-popularity.jsonl"
    popularity.write_text(
        "".join(
            json.dumps({"artist_mbid": m, "total_listen_count": 1, "total_user_count": n}) + "\n"
            for m, n in (("asked", 900), ("new", 600), ("small", 499))
        ),
        encoding="utf-8",
    )
    first = tmp_path / "first.jsonl"
    first.write_text(json.dumps({"artist_mbid": "asked", "similar": []}) + "\n", encoding="utf-8")
    monkeypatch.setattr(cli, "RAW_DIR", tmp_path)
    monkeypatch.setattr(cli, "verified_popularity", lambda: popularity)
    monkeypatch.setattr(cli, "verified_proximity", lambda: [first])
    monkeypatch.setattr(cli, "proximity_snapshot", lambda date: tmp_path / date / "part.jsonl")
    monkeypatch.setattr(cli, "proximity_sums", lambda date: tmp_path / f"{date}.SHA256SUMS")
    asked = []

    def fetch(mbids, dest):
        asked.extend(mbids)
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text("", encoding="utf-8")
        return len(asked)

    monkeypatch.setattr(cli, "fetch_proximity", fetch)
    cli.snapshot_proximity()
    assert asked == ["new"]


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
