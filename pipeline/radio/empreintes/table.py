"""Empreintes de tous les titres mesurés, quelle que soit leur origine."""

import sqlite3
from dataclasses import dataclass

import numpy as np
import numpy.typing as npt

from radio.bibliotheque.rapprochement import normalize
from radio.empreintes.effnet import DIM, MODEL_TAG, from_blob


@dataclass(frozen=True)
class TableEmpreintes:
    track_ids: npt.NDArray[np.int64]
    artist_ids: npt.NDArray[np.int64]
    artist_keys: list[str]
    origins: list[str]
    audio: npt.NDArray[np.float32]


def charger_empreintes(conn: sqlite3.Connection) -> TableEmpreintes:
    rows = conn.execute(
        """
        SELECT t.titre_id AS tid, t.artiste_id AS aid, t.provenance, m.embedding,
               a.name AS aname
        FROM titres t JOIN empreintes m USING (titre_id)
             JOIN artistes a ON a.artiste_id = t.artiste_id
        WHERE m.status = 'ok' AND m.model = ? ORDER BY t.titre_id
        """,
        (MODEL_TAG,),
    ).fetchall()
    audio = np.zeros((len(rows), DIM), dtype=np.float32)
    for i, r in enumerate(rows):
        audio[i] = from_blob(r["embedding"])
    return TableEmpreintes(
        track_ids=np.array([r["tid"] for r in rows], dtype=np.int64),
        artist_ids=np.array([r["aid"] for r in rows], dtype=np.int64),
        artist_keys=[normalize(r["aname"]) or f"#{r['aid']}" for r in rows],
        origins=[r["provenance"] for r in rows],
        audio=audio,
    )
