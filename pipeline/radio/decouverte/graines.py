"""Graines : tirage pondéré sans remise parmi les artistes de la bibliothèque.

Poids d'un artiste : 1 + log(1 + ses écoutes), plafonné à 4 ; chacun garde une chance. Un artiste
tiré lors d'une passe terminée n'est plus tiré pendant `seed_cooldown_days`. Une passe n'est
terminée (graines « utilisées ») que si elle a réussi en entier ; interrompue, elle reprend avec
les mêmes graines.
"""

import sqlite3
from dataclasses import dataclass
from datetime import datetime, timedelta

import numpy as np

from radio.bibliotheque.artistes import LibraryArtist
from radio.bibliotheque.poids import play_weight
from radio.socle.config import DiscoverConfig


@dataclass(frozen=True)
class Run:
    run_id: int
    seeds: list[LibraryArtist]
    resumed: bool
    n_dropped: int


def recently_used(conn: sqlite3.Connection, now: datetime, days: int) -> set[int]:
    since = (now - timedelta(days=days)).isoformat()
    return {
        r[0]
        for r in conn.execute(
            """
            SELECT s.deezer_artist_id FROM run_seeds s JOIN discover_runs r USING (run_id)
            WHERE r.status = 'done' AND r.finished_at >= ?
            """,
            (since,),
        )
    }


def draw_seeds(
    artists: list[LibraryArtist], exclude: set[int], k: int, rng: np.random.Generator
) -> list[LibraryArtist]:
    pool = [a for a in artists if a.deezer_artist_id not in exclude]
    if not pool:
        return []
    w = np.array([play_weight(a.plays) for a in pool])
    picked = rng.choice(len(pool), size=min(k, len(pool)), replace=False, p=w / w.sum())
    return [pool[int(i)] for i in picked]


def start_run(
    conn: sqlite3.Connection,
    artists: list[LibraryArtist],
    cfg: DiscoverConfig,
    now: datetime,
    rng: np.random.Generator,
) -> Run:
    running = conn.execute("SELECT run_id FROM discover_runs WHERE status = 'running'").fetchone()
    if running is not None:
        by_id = {a.deezer_artist_id: a for a in artists}
        seed_ids = [
            r[0]
            for r in conn.execute(
                "SELECT deezer_artist_id FROM run_seeds WHERE run_id = ? ORDER BY rowid",
                (running[0],),
            )
        ]
        seeds = [by_id[i] for i in seed_ids if i in by_id]
        return Run(running[0], seeds, resumed=True, n_dropped=len(seed_ids) - len(seeds))
    seeds = draw_seeds(
        artists, recently_used(conn, now, cfg.seed_cooldown_days), cfg.seeds_per_run, rng
    )
    with conn:
        cur = conn.execute(
            "INSERT INTO discover_runs (started_at, status) VALUES (?, 'running')",
            (now.isoformat(),),
        )
        run_id = cur.lastrowid
        assert run_id is not None
        conn.executemany(
            "INSERT INTO run_seeds VALUES (?, ?)", [(run_id, s.deezer_artist_id) for s in seeds]
        )
    return Run(run_id, seeds, resumed=False, n_dropped=0)


def finish_run(conn: sqlite3.Connection, run_id: int, now: datetime) -> None:
    with conn:
        conn.execute(
            "UPDATE discover_runs SET status = 'done', finished_at = ? WHERE run_id = ?",
            (now.isoformat(), run_id),
        )
