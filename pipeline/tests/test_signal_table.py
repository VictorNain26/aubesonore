import sqlite3
from pathlib import Path

import numpy as np

from radio.signals.audio import DIM, MODEL_TAG, to_blob
from radio.signals.table import load_signals
from tests.factories import make_library

VEC = np.full(DIM, 1 / np.sqrt(DIM), dtype=np.float32)


def build(tmp_path: Path) -> sqlite3.Connection:
    conn = make_library(tmp_path)
    conn.executemany(
        "INSERT INTO artists (deezer_artist_id, name) VALUES (?, ?)",
        [(83, "M83"), (1, "Knife"), (9, "Jul")],
    )
    conn.executemany(
        "INSERT INTO tracks VALUES (?, ?, 'T', ?, ?, 'd')",
        [
            (101, 83, "library", "a"),
            (1, 1, "candidate", "b"),
            (2, 1, "candidate", "c"),
            (3, 1, "candidate", "e"),
            (9, 9, "negative", "d"),
        ],
    )
    conn.executemany(
        "INSERT INTO track_measures VALUES (?, ?, ?, ?, 'd')",
        [
            (101, "ok", to_blob(VEC), MODEL_TAG),
            (1, "ok", to_blob(VEC), MODEL_TAG),
            (2, "no_preview", None, MODEL_TAG),
            (3, "ok", to_blob(VEC), "old-model"),
            (9, "ok", to_blob(VEC), MODEL_TAG),
        ],
    )
    conn.commit()
    return conn


def test_load_signals_keeps_measured_tracks_of_the_current_model(tmp_path: Path) -> None:
    t = load_signals(build(tmp_path))
    assert t.track_ids.tolist() == [1, 9, 101]
    assert t.origins == ["candidate", "negative", "library"]
    assert t.artist_keys == ["knife", "jul", "m83"]
    assert np.array_equal(t.audio, np.stack([VEC] * 3))


def test_artist_key_falls_back_to_the_id(tmp_path: Path) -> None:
    conn = build(tmp_path)
    conn.execute("UPDATE artists SET name = '!!!' WHERE deezer_artist_id = 9")
    conn.commit()
    assert load_signals(conn).artist_keys[1] == "#9"
