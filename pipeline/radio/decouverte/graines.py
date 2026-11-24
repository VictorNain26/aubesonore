"""Graines : tirage pondéré sans remise parmi les artistes de la bibliothèque.

Poids d'un artiste : 1 + log(1 + ses écoutes), plafonné à 4 ; chacun garde une chance. Un artiste
tiré lors d'une passe terminée n'est plus tiré pendant `repos_graine_jours`. Une passe n'est
terminée (graines « utilisées ») que si elle a réussi en entier ; interrompue, elle reprend avec
les mêmes graines.
"""

import sqlite3
from dataclasses import dataclass
from datetime import datetime, timedelta

import numpy as np

from radio.bibliotheque.artistes import ArtisteBibliotheque
from radio.bibliotheque.poids import poids_ecoute
from radio.socle.config import DecouverteConfig


@dataclass(frozen=True)
class Run:
    run_id: int
    seeds: list[ArtisteBibliotheque]
    resumed: bool
    n_dropped: int


def graines_recentes(conn: sqlite3.Connection, now: datetime, days: int) -> set[int]:
    since = (now - timedelta(days=days)).isoformat()
    return {
        r[0]
        for r in conn.execute(
            """
            SELECT s.artiste_id FROM graines s JOIN fournees r USING (fournee_id)
            WHERE r.status = 'done' AND r.finished_at >= ?
            """,
            (since,),
        )
    }


def tirer_graines(
    artists: list[ArtisteBibliotheque], exclude: set[int], k: int, rng: np.random.Generator
) -> list[ArtisteBibliotheque]:
    pool = [a for a in artists if a.deezer_artist_id not in exclude]
    if not pool:
        return []
    w = np.array([poids_ecoute(a.plays) for a in pool])
    picked = rng.choice(len(pool), size=min(k, len(pool)), replace=False, p=w / w.sum())
    return [pool[int(i)] for i in picked]


def start_run(
    conn: sqlite3.Connection,
    artists: list[ArtisteBibliotheque],
    cfg: DecouverteConfig,
    now: datetime,
    rng: np.random.Generator,
) -> Run:
    running = conn.execute("SELECT fournee_id FROM fournees WHERE status = 'running'").fetchone()
    if running is not None:
        by_id = {a.deezer_artist_id: a for a in artists}
        seed_ids = [
            r[0]
            for r in conn.execute(
                "SELECT artiste_id FROM graines WHERE fournee_id = ? ORDER BY rowid",
                (running[0],),
            )
        ]
        seeds = [by_id[i] for i in seed_ids if i in by_id]
        return Run(running[0], seeds, resumed=True, n_dropped=len(seed_ids) - len(seeds))
    seeds = tirer_graines(
        artists, graines_recentes(conn, now, cfg.repos_graine_jours), cfg.graines_par_fournee, rng
    )
    with conn:
        cur = conn.execute(
            "INSERT INTO fournees (started_at, status) VALUES (?, 'running')",
            (now.isoformat(),),
        )
        run_id = cur.lastrowid
        assert run_id is not None
        conn.executemany(
            "INSERT INTO graines VALUES (?, ?)", [(run_id, s.deezer_artist_id) for s in seeds]
        )
    return Run(run_id, seeds, resumed=False, n_dropped=0)


def finish_run(conn: sqlite3.Connection, run_id: int, now: datetime) -> None:
    with conn:
        conn.execute(
            "UPDATE fournees SET status = 'done', finished_at = ? WHERE fournee_id = ?",
            (now.isoformat(), run_id),
        )
