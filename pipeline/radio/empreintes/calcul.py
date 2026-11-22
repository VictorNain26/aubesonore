"""Empreinte de l'extrait Deezer de 30 s de chaque titre.

L'URL d'extrait est demandée fraîche à Deezer juste avant le téléchargement (signée, elle expire).
Elle n'est ni stockée, ni journalisée, ni mise dans un message. Un titre sans extrait ou à
l'empreinte ratée n'est pas jugé ; il est compté. Deezer indisponible : le travail fait est
gardé, puis l'exception remonte.
"""

import logging
import sqlite3
from dataclasses import dataclass, field
from typing import Protocol

import numpy as np
import numpy.typing as npt

from radio.empreintes.effnet import MODEL_TAG, to_blob
from radio.sources.deezer import DeezerClient, DeezerError, DeezerUnavailable

logger = logging.getLogger(__name__)


class Embedder(Protocol):
    def embed(self, data: bytes, suffix: str = ".mp3") -> npt.NDArray[np.float32] | None: ...


@dataclass
class MeasureReport:
    n_todo: int
    n_ok: int = 0
    n_no_preview: int = 0
    n_audio_failed: int = 0
    n_gone: int = 0
    errors: list[str] = field(default_factory=list)


def measure_tracks(
    conn: sqlite3.Connection,
    deezer: DeezerClient,
    embedder: Embedder,
    now: str,
    batch: int = 20,
) -> MeasureReport:
    todo = conn.execute(
        """
        SELECT t.deezer_track_id AS tid, t.title, a.name
        FROM tracks t JOIN artists a USING (deezer_artist_id)
        LEFT JOIN track_measures m USING (deezer_track_id)
        WHERE m.deezer_track_id IS NULL ORDER BY t.deezer_track_id
        """
    ).fetchall()
    rep = MeasureReport(n_todo=len(todo))
    rows: list[tuple[object, ...]] = []

    def flush() -> None:
        with conn:
            conn.executemany("INSERT INTO track_measures VALUES (?, ?, ?, ?, ?)", rows)
        rows.clear()

    try:
        for i, r in enumerate(todo, 1):
            if i % 100 == 0:
                logger.info("measure: %d/%d tracks processed", i, len(todo))
            status: str
            blob: bytes | None = None
            try:
                got = deezer.track(r["tid"])
                if got is None:
                    status = "gone"
                else:
                    _, url = got
                    if url is None:
                        status = "no_preview"
                    else:
                        try:
                            vec = embedder.embed(deezer.download(url))
                        except DeezerError:
                            vec = None
                        status = "ok" if vec is not None else "audio_failed"
                        blob = to_blob(vec) if vec is not None else None
            except DeezerUnavailable:
                logger.warning("measure: stopped at track %s (%d)", r["title"], r["tid"])
                raise
            except DeezerError as e:
                rep.errors.append(f"{r['name']} — {r['title']} ({type(e).__name__})")
                continue
            rows.append((r["tid"], status, blob, MODEL_TAG, now))
            if status == "ok":
                rep.n_ok += 1
            elif status == "no_preview":
                rep.n_no_preview += 1
            elif status == "audio_failed":
                rep.n_audio_failed += 1
            else:
                rep.n_gone += 1
            if len(rows) >= batch:
                flush()
    finally:
        flush()
    return rep
