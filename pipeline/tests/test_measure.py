import logging
import sqlite3
from pathlib import Path

import numpy as np
import numpy.typing as npt
import pytest

from radio.core.db import connect
from radio.signals.audio import DIM, MODEL_TAG, from_blob
from radio.signals.measure import measure_tracks
from radio.sources.deezer import DeezerError, DeezerTrack, DeezerUnavailable

URL = "https://cdnt-preview.dzcdn.net/x.mp3?hdnea=SIGNED-SECRET"
VEC = np.full(DIM, 1 / np.sqrt(DIM), dtype=np.float32)


def dt(tid: int) -> DeezerTrack:
    return DeezerTrack(tid, "T", "T", 200, 500, 1, "Knife", True)


class FakeDeezer:
    def __init__(self, tracks: dict[int, object], fail_download: bool = False) -> None:
        self._tracks = tracks
        self.fail_download = fail_download

    def track(self, track_id: int) -> object:
        v = self._tracks[track_id]
        if isinstance(v, Exception):
            raise v
        return v

    def download(self, url: str) -> bytes:
        assert url == URL
        if self.fail_download:
            raise DeezerError("preview HTTP 404")
        return b"mp3"


class FakeEmbedder:
    def __init__(self, result: npt.NDArray[np.float32] | None = VEC) -> None:
        self.result = result

    def embed(self, data: bytes, suffix: str = ".mp3") -> npt.NDArray[np.float32] | None:
        return self.result


def db(tmp_path: Path, n: int = 5) -> sqlite3.Connection:
    conn = connect(tmp_path / "radio.db")
    conn.execute("INSERT INTO artists (deezer_artist_id, name) VALUES (1, 'Knife')")
    conn.executemany(
        "INSERT INTO tracks VALUES (?, 1, 'T', 'candidate', ?, 'd')",
        [(i, f"k{i}") for i in range(1, n + 1)],
    )
    conn.commit()
    return conn


def rows(conn: sqlite3.Connection) -> dict[int, str]:
    return {r["deezer_track_id"]: r["status"] for r in conn.execute("SELECT * FROM track_measures")}


def test_statuses(tmp_path: Path, caplog: pytest.LogCaptureFixture) -> None:
    caplog.set_level(logging.DEBUG)
    conn = db(tmp_path)
    dz = FakeDeezer(
        {
            1: (dt(1), URL),
            2: (dt(2), None),
            3: None,
            4: DeezerError("code 501"),
            5: (dt(5), URL),
        }
    )
    emb = FakeEmbedder()
    rep = measure_tracks(conn, dz, emb, "d")
    assert (rep.n_todo, rep.n_ok, rep.n_no_preview, rep.n_gone) == (5, 2, 1, 1)
    assert (rep.n_audio_failed, rep.errors) == (0, ["Knife — T (DeezerError)"])
    assert rows(conn) == {1: "ok", 2: "no_preview", 3: "gone", 5: "ok"}
    blob = conn.execute("SELECT embedding, model FROM track_measures WHERE deezer_track_id = 1")
    b, model = blob.fetchone()
    assert np.array_equal(from_blob(b), VEC) and model == MODEL_TAG
    dump = "\n".join(conn.iterdump())
    assert "SIGNED-SECRET" not in dump and "SIGNED-SECRET" not in caplog.text
    dz._tracks[4] = (dt(4), URL)
    assert measure_tracks(conn, dz, emb, "d2").n_todo == 1


def test_failed_audio(tmp_path: Path) -> None:
    # Téléchargement refusé, puis audio illisible : deux bases d'un titre chacune.
    conn = db(tmp_path / "a", n=1)
    measure_tracks(conn, FakeDeezer({1: (dt(1), URL)}, fail_download=True), FakeEmbedder(), "d")
    conn2 = db(tmp_path / "b", n=1)
    measure_tracks(conn2, FakeDeezer({1: (dt(1), URL)}), FakeEmbedder(None), "d")
    assert rows(conn) == {1: "audio_failed"}
    assert rows(conn2) == {1: "audio_failed"}


def test_unavailable_commits_work_done_and_names_track(
    tmp_path: Path, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.WARNING)
    conn = db(tmp_path, n=3)
    dz = FakeDeezer({1: (dt(1), URL), 2: (dt(2), None), 3: DeezerUnavailable("code 4")})
    with pytest.raises(DeezerUnavailable):
        measure_tracks(conn, dz, FakeEmbedder(), "d")
    assert set(rows(conn)) == {1, 2}
    assert caplog.messages == ["measure: stopped at track T (3)"]
