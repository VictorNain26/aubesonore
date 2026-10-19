"""Base de démonstration du modèle : le goût est la direction LIKED de l'empreinte.

Bibliothèque et candidats « aimés » (artistes 2000+) pointent vers LIKED (6 écarts-types, pour
des tests stables) ; candidats « rejetés »
(3000+) et négatifs (4000+) vers DISLIKED. Le bruit est confiné aux 16 premières dimensions : sur
1280 dimensions, StandardScaler ramènerait sinon les dimensions de pur bruit à variance unitaire et
noierait les 2 dimensions du signal.
"""

import sqlite3
from pathlib import Path

import numpy as np

from radio.core.db import connect
from radio.discover.candidates import add_tracks
from radio.library.artists import register_library
from radio.signals.audio import DIM, MODEL_TAG, to_blob
from radio.sources.deezer import DeezerTrack

NOW = "2026-09-25T00:00:00+00:00"
LIKED = np.eye(DIM, dtype=np.float32)[0]
DISLIKED = np.eye(DIM, dtype=np.float32)[1]


def make_model_db(
    directory: Path, n_artists: int = 12, per_artist: int = 4, seed: int = 0
) -> sqlite3.Connection:
    rng = np.random.default_rng(seed)
    conn = connect(directory / "radio.db")
    lib, matches = [], []
    for a in range(n_artists):
        for k in range(per_artist):
            key = f"p{a}-{k}"
            plays = int(rng.integers(0, 20))
            lib.append((key, f"Lib {a}", f"Chanson {k}", "Album", 200000, plays, NOW))
            matches.append((key, "matched", None, 100000 + 10 * a + k, 1000 + a, NOW))
    conn.executemany("INSERT INTO library_tracks VALUES (?, ?, ?, ?, ?, ?, ?, NULL)", lib)
    conn.executemany("INSERT INTO deezer_matches VALUES (?, ?, ?, ?, ?, ?)", matches)
    conn.commit()
    register_library(conn, NOW)
    for base, origin in ((2000, "candidate"), (3000, "candidate"), (4000, "negative")):
        for a in range(n_artists):
            aid = base + a
            tracks = [
                DeezerTrack(
                    aid * 100 + k, f"Titre {k}", f"Titre {k}", 200, 1000, aid, f"Art {aid}", True
                )
                for k in range(per_artist)
            ]
            add_tracks(conn, aid, f"Art {aid}", tracks, origin, NOW)
    for tid, aid, origin in conn.execute(
        "SELECT deezer_track_id, deezer_artist_id, origin FROM tracks"
    ).fetchall():
        liked = origin == "library" or 2000 <= aid < 3000
        noise = np.zeros(DIM)
        noise[:16] = rng.normal(size=16)
        v = 6 * (LIKED if liked else DISLIKED) + noise
        blob = to_blob((v / np.linalg.norm(v)).astype(np.float32))
        conn.execute(
            "INSERT INTO track_measures VALUES (?, 'ok', ?, ?, ?)", (tid, blob, MODEL_TAG, NOW)
        )
    conn.commit()
    return conn


def add_vote(
    conn: sqlite3.Connection,
    track_id: int,
    kind: str,
    vote: str,
    at: str = "2026-09-24T12:00:00+00:00",
) -> None:
    conn.execute("INSERT INTO votes VALUES (?, ?, ?, ?, 'test')", (track_id, kind, vote, at))
    conn.commit()


def serve_scores(conn: sqlite3.Connection) -> None:
    """Un modèle promu et des notes exactes en binaire pour tous les candidats.

    Fournée 1 : artistes a < 6 ; fournée 2 (la dernière) : a >= 6. Aimé k -> 0,5 + 0,0625(k+1)
    (retenu), rejeté k -> 0,5 - 0,0625(k+1). Coupure 0,5625 : les plus incertains sont les k = 0.
    """
    conn.execute("INSERT INTO discover_runs VALUES (1, 'd', 'd', 'done'), (2, 'd', 'd', 'done')")
    conn.execute(
        "INSERT INTO models VALUES (1, 'd', 'modele-0001.joblib', 1, 'premier modèle', "
        "'{\"votes\": 0}', '{}')"
    )
    rows = conn.execute(
        "SELECT deezer_track_id, deezer_artist_id FROM tracks WHERE origin = 'candidate'"
    ).fetchall()
    for tid, aid in rows:
        step = 0.0625 * (tid % 100 + 1)
        score = 0.5 + step if aid < 3000 else 0.5 - step
        conn.execute(
            "INSERT INTO candidates (deezer_track_id, run_id, source, seed_artist_id, "
            "neighbour_artist_id) VALUES (?, ?, 'voisin', 1000, ?)",
            (tid, 2 if aid % 100 >= 6 else 1, aid),
        )
        conn.execute(
            "INSERT INTO scores (deezer_track_id, model_id, score, accepted) VALUES (?, 1, ?, ?)",
            (tid, score, int(score >= 0.5)),
        )
    conn.commit()


def seed_run(conn: sqlite3.Connection) -> None:
    """Une fournée de découverte unique (`radio discover` a besoin du réseau) : tous les
    candidats y entrent."""
    conn.execute("INSERT INTO discover_runs VALUES (1, 'd', 'd', 'done')")
    conn.execute(
        "INSERT INTO candidates (deezer_track_id, run_id, source, seed_artist_id, "
        "neighbour_artist_id) SELECT deezer_track_id, 1, 'voisin', 1000, deezer_artist_id "
        "FROM tracks WHERE origin = 'candidate'"
    )
    conn.commit()
