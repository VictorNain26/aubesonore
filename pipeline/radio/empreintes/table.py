"""Empreintes de tous les titres mesurés, quelle que soit leur origine."""

import sqlite3
from dataclasses import dataclass

import numpy as np
import numpy.typing as npt

from radio.bibliotheque.rapprochement import normalize
from radio.empreintes.effnet import DIM, MODEL_TAG, from_blob


@dataclass(frozen=True)
class SignalTable:
    track_ids: npt.NDArray[np.int64]
    artist_ids: npt.NDArray[np.int64]
    artist_keys: list[str]
    origins: list[str]
    audio: npt.NDArray[np.float32]


def load_signals(conn: sqlite3.Connection) -> SignalTable:
    rows = conn.execute(
        """
        SELECT t.deezer_track_id AS tid, t.deezer_artist_id AS aid, t.origin, m.embedding,
               a.name AS aname
        FROM tracks t JOIN track_measures m USING (deezer_track_id)
             JOIN artists a ON a.deezer_artist_id = t.deezer_artist_id
        WHERE m.status = 'ok' AND m.model = ? ORDER BY t.deezer_track_id
        """,
        (MODEL_TAG,),
    ).fetchall()
    audio = np.zeros((len(rows), DIM), dtype=np.float32)
    for i, r in enumerate(rows):
        audio[i] = from_blob(r["embedding"])
    return SignalTable(
        track_ids=np.array([r["tid"] for r in rows], dtype=np.int64),
        artist_ids=np.array([r["aid"] for r in rows], dtype=np.int64),
        artist_keys=[normalize(r["aname"]) or f"#{r['aid']}" for r in rows],
        origins=[r["origin"] for r in rows],
        audio=audio,
    )
