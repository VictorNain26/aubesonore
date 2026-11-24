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
class RapportEmpreintes:
    n_todo: int
    n_ok: int = 0
    n_no_preview: int = 0
    n_audio_failed: int = 0
    n_gone: int = 0
    errors: list[str] = field(default_factory=list)


def calculer_empreintes(
    conn: sqlite3.Connection,
    deezer: DeezerClient,
    embedder: Embedder,
    now: str,
    batch: int = 20,
) -> RapportEmpreintes:
    todo = conn.execute(
        """
        SELECT t.titre_id AS tid, t.title, a.name
        FROM titres t JOIN artistes a USING (artiste_id)
        LEFT JOIN empreintes m USING (titre_id)
        WHERE m.titre_id IS NULL ORDER BY t.titre_id
        """
    ).fetchall()
    rep = RapportEmpreintes(n_todo=len(todo))
    rows: list[tuple[object, ...]] = []

    def flush() -> None:
        with conn:
            conn.executemany("INSERT INTO empreintes VALUES (?, ?, ?, ?, ?)", rows)
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
                    status = "disparu"
                else:
                    _, url = got
                    if url is None:
                        status = "sans_extrait"
                    else:
                        try:
                            vec = embedder.embed(deezer.download(url))
                        except DeezerError:
                            vec = None
                        status = "ok" if vec is not None else "audio_rate"
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
            elif status == "sans_extrait":
                rep.n_no_preview += 1
            elif status == "audio_rate":
                rep.n_audio_failed += 1
            else:
                rep.n_gone += 1
            if len(rows) >= batch:
                flush()
    finally:
        flush()
    return rep
