import json
import subprocess

from conftest import FIX

from musilogy import cli
from musilogy.cli import WITNESSES, fixtures_attribution
from musilogy.paths import REPO_ROOT


def test_every_witness_is_present():
    with (FIX / "artists.jsonl").open(encoding="utf-8") as fh:
        ids = {json.loads(line)["mbid"] for line in fh}
    assert set(WITNESSES) <= ids


def test_beatles_genres_carry_mbid_and_votes():
    with (FIX / "artists.jsonl").open(encoding="utf-8") as fh:
        for line in fh:
            rec = json.loads(line)
            if rec["mbid"] == "b10bbbfc-cf9e-42e0-be17-e2c3e1d2600d":
                assert rec["genres"], "genres must be preserved"
                assert all(g["mbid"] and "votes" in g for g in rec["genres"])
                return
    raise AssertionError("The Beatles missing from fixtures")


def test_release_groups_file_is_well_formed_and_complete():
    with (FIX / "release_groups.jsonl").open(encoding="utf-8") as fh:
        lines = fh.readlines()
    records = [json.loads(line) for line in lines]
    # Number frozen at extraction time: any truncation or dropped line changes it.
    assert len(records) == 10617


def test_every_release_group_credits_a_witness():
    wanted = set(WITNESSES)
    with (FIX / "release_groups.jsonl").open(encoding="utf-8") as fh:
        for line in fh:
            rec = json.loads(line)
            assert wanted & set(rec["artists"]), rec["mbid"]


def test_the_fixture_files_are_not_ignored_by_git():
    # *.jsonl is ignored repo-wide and the negation still pointed at
    # pipeline/tests/fixtures/, removed by the restructuring: the witnesses
    # survived only because they were already in the index. On a fresh clone,
    # `musilogy make-fixtures` followed by `git add` would drop them silently.
    for name in (
        "artists.jsonl",
        "release_groups.jsonl",
        "popularity.jsonl",
        "discography.jsonl",
        "proximity.jsonl",
        "official.jsonl",
        "discogs.jsonl",
    ):
        result = subprocess.run(
            ["git", "check-ignore", "--no-index", f"tests/fixtures/{name}"],
            cwd=REPO_ROOT,
            capture_output=True,
            text=True,
            check=False,
        )
        # 128 means git itself failed (e.g. run outside a repository), not
        # that the path is tracked: conflating it with the "not ignored" case
        # would report a false pass instead of an unanswerable check.
        assert result.returncode != 128, (
            f"git check-ignore could not answer for tests/fixtures/{name}: {result.stderr.strip()}"
        )
        assert result.returncode == 1, f"tests/fixtures/{name} is ignored: {result.stdout.strip()}"


def test_the_attribution_names_the_pinned_sources():
    # Written by make-fixtures from the pinned references: a hand-written one
    # fell behind the popularity re-pin of 2026-10-06.
    assert (FIX / "ATTRIBUTION.md").read_text(encoding="utf-8") == fixtures_attribution()


def test_the_discogs_fixture_is_what_the_witnesses_discogs_pages_select(tmp_path, monkeypatch):
    # Breaks if make-fixtures reads a Discogs id other than the build's
    # discogs_artist_id does: replayed on the fixtures, the selection must give
    # back every committed line, and only those.
    monkeypatch.setattr(cli, "verified_discogs", lambda: FIX / "discogs.jsonl")
    out = tmp_path / "discogs.jsonl"
    cli._discogs_fixture(FIX / "artists.jsonl", out)
    assert out.read_text(encoding="utf-8") == (FIX / "discogs.jsonl").read_text(encoding="utf-8")
