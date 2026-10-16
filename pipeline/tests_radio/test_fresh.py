import sqlite3
from pathlib import Path

import pytest
import requests
import responses
from typer.testing import CliRunner

import radio.cli as cli
from radio.core.config import FreshConfig, Settings
from radio.discover.fresh import NoBatchError, fresh_pass
from radio.library.artists import register_library
from radio.sources.deezer import DeezerTrack
from radio.sources.hypem import API, HypemClient, HypemError, HypemTrack, HypemUnavailable
from radio.votes.suivi import yes_by_source
from tests_radio.factories import make_library

NOW = "2026-10-01T00:00:00+00:00"
CFG = FreshConfig(hypem_pages=1, deezer_editorial={"alternative": 85}, tracks_per_album=2)


def dt(
    tid: int, aid: int, artist: str, title: str, rank: int = 1, duration: int = 200
) -> DeezerTrack:
    return DeezerTrack(tid, title, title, duration, rank, aid, artist, True)


class FakeHypem:
    def __init__(self, tracks: list[HypemTrack] | Exception) -> None:
        self.tracks = tracks

    def popular(self, mode: str, page: int) -> list[HypemTrack]:
        assert mode == "lastweek"
        if isinstance(self.tracks, Exception):
            raise self.tracks
        return self.tracks


class FakeDeezer:
    def __init__(self) -> None:
        self.search = {
            "Fine Sometimes i rush": [dt(501, 50, "Fine", "Sometimes i rush")],
            "M83 Midnight City": [dt(999, 83, "M83", "Midnight City", duration=243)],
        }

    def search_tracks(self, query: str, limit: int = 10) -> list[DeezerTrack]:
        return self.search.get(query, [])

    def editorial_selection(self, genre_id: int) -> list[int]:
        assert genre_id == 85
        return [7]

    def album_tracks(self, album_id: int) -> list[DeezerTrack]:
        return [dt(700 + k, 60, "Julia Holter", f"Song {k}", rank=k) for k in range(5)]


def _db(tmp_path: Path) -> sqlite3.Connection:
    conn = make_library(tmp_path)
    register_library(conn, NOW)
    conn.execute("INSERT INTO discover_runs VALUES (4, 'd', 'd', 'done')")
    conn.commit()
    return conn


def _candidates(conn: sqlite3.Connection) -> dict[int, tuple[str, str | None]]:
    rows = conn.execute("SELECT deezer_track_id, run_id, source, detail FROM candidates")
    out = {}
    for tid, run, source, detail in rows:
        assert run == 4
        out[int(tid)] = (str(source), detail)
    return out


def test_fresh_titles_join_the_last_batch_with_their_source(tmp_path: Path) -> None:
    conn = _db(tmp_path)
    hypem = FakeHypem(
        [
            HypemTrack("Fine", "Sometimes i rush", 201, "Gorilla vs. Bear"),
            HypemTrack("Nobody", "Not on Deezer", 180, "Some Blog"),
            HypemTrack("M83", "Midnight City", 243, "Some Blog"),  # déjà dans la bibliothèque
        ]
    )
    rep = fresh_pass(conn, FakeDeezer(), hypem, CFG, 3, NOW)  # type: ignore[arg-type]

    assert _candidates(conn) == {
        501: ("hypem", "Gorilla vs. Bear"),
        704: ("deezer_editorial", "alternative"),  # les 2 titres les plus écoutés de l'album
        703: ("deezer_editorial", "alternative"),
    }
    assert dict(rep.seen) == {"hypem": 3, "deezer_editorial": 5}
    assert dict(rep.added) == {"hypem": 1, "deezer_editorial": 2}
    assert (rep.n_unmatched, rep.n_known, rep.skipped) == (1, 1, [])

    # La semaine suivante, mêmes sélections : rien de neuf, et c'est compté par source.
    again = fresh_pass(conn, FakeDeezer(), hypem, CFG, 3, NOW)  # type: ignore[arg-type]
    assert sum(again.added.values()) == 0
    assert dict(again.already) == {"hypem": 1, "deezer_editorial": 2}


def test_a_broken_source_is_named_and_the_others_still_run(tmp_path: Path) -> None:
    conn = _db(tmp_path)
    rep = fresh_pass(conn, FakeDeezer(), FakeHypem(HypemError("not a list")), CFG, 3, NOW)  # type: ignore[arg-type]
    assert rep.skipped == ["Hype Machine, page 1 (HypemError : not a list)"]
    assert dict(rep.added) == {"deezer_editorial": 2}


def test_fresh_needs_a_batch(tmp_path: Path) -> None:
    conn = make_library(tmp_path)
    with pytest.raises(NoBatchError):
        fresh_pass(conn, FakeDeezer(), FakeHypem([]), CFG, 3, NOW)  # type: ignore[arg-type]


def test_exam_yes_rate_by_source_and_blog(tmp_path: Path) -> None:
    conn = _db(tmp_path)
    fresh_pass(
        conn,
        FakeDeezer(),  # type: ignore[arg-type]
        FakeHypem([HypemTrack("Fine", "Sometimes i rush", 201, "Gorilla vs. Bear")]),  # type: ignore[arg-type]
        CFG,
        3,
        NOW,
    )
    for tid, vote in ((501, "oui"), (704, "non"), (703, "oui")):
        conn.execute("INSERT INTO votes VALUES (?, 'exam', ?, 'd', 'page')", (tid, vote))
    conn.commit()
    rates = {key: (r.yes, r.n) for key, r in yes_by_source(conn)}
    assert rates == {
        "deezer_editorial": (1, 2),
        "deezer_editorial · alternative": (1, 2),
        "hypem": (1, 1),
        "hypem · Gorilla vs. Bear": (1, 1),
    }


@responses.activate
def test_hypem_client_reads_popular_tracks() -> None:
    url = API + "/popular"
    track = {"artist": "Fine", "title": "Sometimes i rush", "time": 201, "sitename": "GvB"}
    responses.get(url, json=[track])
    assert HypemClient().popular("lastweek", 1) == [
        HypemTrack("Fine", "Sometimes i rush", 201, "GvB")
    ]
    call = responses.calls[0].request
    assert "mode=lastweek" in str(call.url) and "page=1" in str(call.url)
    assert str(call.headers["User-Agent"]).startswith("AubeSonore/")


@responses.activate
def test_hypem_client_never_turns_a_change_into_an_empty_list() -> None:
    url = API + "/popular"
    responses.get(url, json={"error": "gone"})
    with pytest.raises(HypemError):
        HypemClient().popular("lastweek", 1)
    responses.replace(responses.GET, url, json=[{"artist": "A"}])
    with pytest.raises(HypemError):
        HypemClient().popular("lastweek", 1)
    responses.replace(responses.GET, url, status=503)
    with pytest.raises(HypemUnavailable):
        HypemClient().popular("lastweek", 1)
    responses.replace(responses.GET, url, body=requests.ConnectionError("x"))
    with pytest.raises(HypemUnavailable):
        HypemClient().popular("lastweek", 1)


def test_cli_reports_the_fresh_stage_and_fails_on_a_broken_source(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _db(tmp_path / "data").close()
    cfg = tmp_path / "config"
    cfg.mkdir()
    (cfg / "editorial.toml").write_text(
        "[nouveautes]\nhypem_pages = 1\n[nouveautes.deezer_editorial]\nalternative = 85\n"
    )
    settings = Settings(_env_file=None, RADIO_DATA_DIR=tmp_path / "data", RADIO_CONFIG_DIR=cfg)
    monkeypatch.setattr(cli.common, "_settings", lambda: settings)
    monkeypatch.setattr(cli.gout, "DeezerClient", FakeDeezer)
    monkeypatch.setattr(cli.gout, "HypemClient", lambda: FakeHypem(HypemUnavailable("HTTP 503")))
    result = CliRunner().invoke(cli.app, ["nouveautes"])
    assert result.exit_code == 1
    assert "source sautée : Hype Machine, page 1 (HypemUnavailable : HTTP 503)" in result.output
    rows = (
        sqlite3.connect(tmp_path / "data" / "radio.db")
        .execute("SELECT ok FROM stage_reports WHERE stage = 'nouveautes'")
        .fetchall()
    )
    assert rows == [(0,)]
