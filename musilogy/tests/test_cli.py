import json

import pytest
from conftest import FIX

from musilogy import cli


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
    monkeypatch.setattr(cli, "verified_proximity", lambda: FIX / "proximity.jsonl")

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


def test_run_stops_when_the_pinned_proximity_is_missing(tmp_path, monkeypatch):
    # The neighbours change with every listening day: a run neither asks
    # ListenBrainz again nor builds without the snapshot it pins.
    monkeypatch.setattr(cli, "ARTISTS_JSONL", FIX / "artists.jsonl")
    monkeypatch.setattr(cli, "RELEASE_GROUPS_JSONL", FIX / "release_groups.jsonl")
    monkeypatch.setattr(cli, "verified_popularity", lambda: FIX / "popularity.jsonl")
    monkeypatch.setattr(cli, "verified_influences", lambda: FIX / "influences.jsonl")
    monkeypatch.setattr(cli, "PROXIMITY_JSONL", tmp_path / "artist-similar.jsonl")
    with pytest.raises(SystemExit) as raised:
        cli.run()
    assert "cannot be taken again" in str(raised.value)
