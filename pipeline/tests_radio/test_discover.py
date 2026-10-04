import logging
import sqlite3
from datetime import UTC, datetime
from pathlib import Path

import numpy as np
import pytest

from radio.core.config import DiscoverConfig
from radio.core.db import connect
from radio.discover.run import NoLibraryArtistsError, discover_pass
from radio.discover.seeds import recently_used
from radio.sources.deezer import DeezerArtist, DeezerError, DeezerTrack, DeezerUnavailable
from radio.sources.lastfm import LastfmUnavailable
from tests_radio.factories import make_library

NOW = datetime(2026, 9, 25, tzinfo=UTC)
CFG = DiscoverConfig()


def dt(tid: int, aid: int, title: str, preview: bool = True) -> DeezerTrack:
    return DeezerTrack(tid, title, title, 200, 1000, aid, "x", preview)


class FakeDeezer:
    def __init__(self) -> None:
        self._related = {
            83: [DeezerArtist(1, "Knife"), DeezerArtist(70, "Wire")],
            70: [DeezerArtist(1, "Knife"), DeezerArtist(2, "The Fall")],
        }
        self.top_: dict[int, list[DeezerTrack] | Exception] = {
            1: [
                dt(11, 1, "Heartbeats"),
                dt(13, 1, "Heartbeats (Remastered)"),
                dt(14, 99, "Collab"),
                dt(15, 1, "No Preview", preview=False),
            ],
            2: [dt(21, 2, "Totally Wired")],
        }
        self.top_calls: list[int] = []

    def related(self, artist_id: int) -> list[DeezerArtist]:
        return self._related.get(artist_id, [])

    def top(self, artist_id: int, limit: int = 10) -> list[DeezerTrack]:
        self.top_calls.append(artist_id)
        v = self.top_[artist_id]
        if isinstance(v, Exception):
            raise v
        return v


class FakeLastfm:
    def __init__(self) -> None:
        self.similar: dict[str, list[str] | Exception] = {
            "M83": ["The Knife", "Wire"],
            "Wire": ["Knife", "Fall"],
        }

    def similar_artists(self, artist: str, limit: int = 100) -> list[str]:
        v = self.similar[artist]
        if isinstance(v, Exception):
            raise v
        return v


def status(conn: sqlite3.Connection) -> str:
    return str(conn.execute("SELECT status FROM discover_runs").fetchone()[0])


def test_discover_pass(tmp_path: Path) -> None:
    conn = make_library(tmp_path)
    dz, lf = FakeDeezer(), FakeLastfm()
    rep = discover_pass(conn, dz, lf, CFG, NOW, np.random.default_rng(0))
    assert (rep.run_id, rep.resumed, rep.n_seeds, rep.n_dropped) == (1, False, 2, 0)
    assert (rep.n_neighbours, rep.n_seen, rep.n_added) == (2, 5, 2)
    assert (rep.n_duplicates, rep.n_filtered, rep.skipped) == (1, 2, [])
    assert sorted(dz.top_calls) == [1, 2]
    rows = conn.execute(
        "SELECT deezer_track_id, run_id, neighbour_artist_id FROM candidates ORDER BY 1"
    ).fetchall()
    assert [(r[0], r[1], r[2]) for r in rows] == [(11, 1, 1), (21, 1, 2)]
    assert status(conn) == "done"
    assert recently_used(conn, NOW, 30) == {70, 83}


def test_definitive_error_skips_and_names(tmp_path: Path) -> None:
    conn = make_library(tmp_path)
    dz = FakeDeezer()
    dz.top_[2] = DeezerError("code 501")
    rep = discover_pass(conn, dz, FakeLastfm(), CFG, NOW, np.random.default_rng(0))
    assert rep.skipped == ["The Fall (DeezerError)"]
    assert status(conn) == "done"


def test_a_neighbour_without_titles_is_skipped_and_named(tmp_path: Path) -> None:
    # Breaks if an empty top passes in silence. It happens: 1 related artist out of 1 809 had no
    # title on Deezer, measured on 2026-10-04.
    conn = make_library(tmp_path)
    dz = FakeDeezer()
    dz.top_[2] = []
    rep = discover_pass(conn, dz, FakeLastfm(), CFG, NOW, np.random.default_rng(0))
    assert rep.skipped == ["The Fall (aucun titre sur Deezer)"]
    assert rep.n_added == 1 and status(conn) == "done"


def test_no_title_for_any_neighbour_is_deezer_down_and_keeps_the_seeds(tmp_path: Path) -> None:
    # Breaks if Deezer answering empty for every neighbour passes as a discovery that found
    # nothing: on 2026-10-04, 126 neighbours gave 0 titles, the seeds were spent and nothing
    # alerted.
    conn = make_library(tmp_path)
    dz = FakeDeezer()
    dz.top_ = {1: [], 2: []}
    with pytest.raises(DeezerUnavailable, match="aucun titre pour 2 voisins"):
        discover_pass(conn, dz, FakeLastfm(), CFG, NOW, np.random.default_rng(0))
    assert status(conn) == "running"
    assert recently_used(conn, NOW, 30) == set()
    rep = discover_pass(conn, FakeDeezer(), FakeLastfm(), CFG, NOW, np.random.default_rng(1))
    assert rep.resumed and rep.n_added == 2 and status(conn) == "done"


def test_a_seed_without_related_artists_is_no_outage(tmp_path: Path) -> None:
    # 19 library artists out of 200 have no related artist on Deezer (measured on 2026-10-04).
    conn = make_library(tmp_path)
    dz = FakeDeezer()
    dz._related[70] = []
    rep = discover_pass(conn, dz, FakeLastfm(), CFG, NOW, np.random.default_rng(0))
    assert rep.n_added == 1 and status(conn) == "done"


def test_no_related_artist_for_any_seed_is_deezer_down(tmp_path: Path) -> None:
    # Breaks if Deezer answering empty on `related` for every seed passes as a discovery without
    # neighbours: the seeds are spent and nothing alerts (review of #298).
    conn = make_library(tmp_path)
    dz = FakeDeezer()
    dz._related = {}
    with pytest.raises(DeezerUnavailable, match="aucun artiste relié pour 2 graines"):
        discover_pass(conn, dz, FakeLastfm(), CFG, NOW, np.random.default_rng(0))
    assert status(conn) == "running"


def test_no_similar_artist_for_any_seed_is_lastfm_down(tmp_path: Path) -> None:
    conn = make_library(tmp_path)
    lf = FakeLastfm()
    lf.similar = {"M83": [], "Wire": []}
    with pytest.raises(LastfmUnavailable, match="aucun artiste similaire pour 2 graines"):
        discover_pass(conn, FakeDeezer(), lf, CFG, NOW, np.random.default_rng(0))
    assert status(conn) == "running"


def test_unavailable_keeps_work_and_resumes_same_run(tmp_path: Path) -> None:
    conn = make_library(tmp_path)
    dz, lf = FakeDeezer(), FakeLastfm()
    lf.similar["Wire"] = LastfmUnavailable("code 29")
    with pytest.raises(LastfmUnavailable):
        discover_pass(conn, dz, lf, CFG, NOW, np.random.default_rng(0))
    assert status(conn) == "running"
    assert recently_used(conn, NOW, 30) == set()
    lf = FakeLastfm()
    rep = discover_pass(conn, dz, lf, CFG, NOW, np.random.default_rng(1))
    assert rep.resumed and rep.run_id == 1
    assert status(conn) == "done"


def test_transient_error_logs_seed_and_propagates(
    tmp_path: Path, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.WARNING)
    conn = make_library(tmp_path)
    dz, lf = FakeDeezer(), FakeLastfm()
    lf.similar["Wire"] = LastfmUnavailable("code 29")
    with pytest.raises(LastfmUnavailable):
        discover_pass(conn, dz, lf, CFG, NOW, np.random.default_rng(0))
    assert caplog.messages == ["discover: stopped at seed Wire (70)"]


def test_transient_error_logs_neighbour_and_propagates(
    tmp_path: Path, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.WARNING)
    conn = make_library(tmp_path)
    dz, lf = FakeDeezer(), FakeLastfm()
    dz.top_[1] = DeezerUnavailable("code 4")
    with pytest.raises(DeezerUnavailable):
        discover_pass(conn, dz, lf, CFG, NOW, np.random.default_rng(0))
    assert caplog.messages == ["discover: stopped at neighbour Knife (1)"]


def test_no_library_artist(tmp_path: Path) -> None:
    conn = connect(tmp_path / "radio.db")
    with pytest.raises(NoLibraryArtistsError):
        discover_pass(conn, FakeDeezer(), FakeLastfm(), CFG, NOW, np.random.default_rng(0))
