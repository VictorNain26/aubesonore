"""Candidats : titres d'un voisin ou d'un négatif (filtre et insertion dédoublonnée), inscription
dans une fournée, et rapprochement d'un titre Hype Machine sur Deezer."""

import sqlite3

from radio.bibliotheque.doublons import dedupe_key
from radio.bibliotheque.rapprochement import pick_match, search_query
from radio.sources.deezer import DeezerClient, DeezerTrack
from radio.sources.hypem import HypemTrack


def garder_titres(top: list[DeezerTrack], artist_id: int) -> list[DeezerTrack]:
    """Seuls les titres dont l'artiste est l'artiste principal et qui ont un extrait."""
    return [t for t in top if t.artist_id == artist_id and t.has_preview]


def ajouter_titres(
    conn: sqlite3.Connection,
    artist_id: int,
    artist_name: str,
    tracks: list[DeezerTrack],
    origin: str,
    now: str,
) -> list[int]:
    """Insère l'artiste et ses titres ; renvoie les ids ajoutés. Un doublon (même id, ou même clé
    de dédoublonnage pour cette origine) est écarté : on garde la première référence, la plus
    populaire puisque Deezer trie son top par rang."""
    conn.execute(
        "INSERT INTO artistes (artiste_id, name) VALUES (?, ?) ON CONFLICT DO NOTHING",
        (artist_id, artist_name),
    )
    added = []
    for t in tracks:
        cur = conn.execute(
            """
            INSERT INTO titres (titre_id, artiste_id, title, provenance, dedupe_key,
                                added_at)
            VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING
            """,
            (t.id, artist_id, t.title, origin, dedupe_key(artist_name, t.title), now),
        )
        if cur.rowcount:
            added.append(t.id)
    return added


def ajouter_candidats(
    conn: sqlite3.Connection,
    run_id: int,
    source: str,
    track_ids: list[int],
    *,
    detail: str | None = None,
    seed_artist_id: int | None = None,
    neighbour_artist_id: int | None = None,
) -> None:
    """Inscrit des titres déjà ajoutés comme candidats de la fournée `run_id`, venus de `source`."""
    conn.executemany(
        "INSERT INTO candidats (titre_id, fournee_id, source, detail, seed_artist_id, "
        "neighbour_artist_id) VALUES (?, ?, ?, ?, ?, ?)",
        [(tid, run_id, source, detail, seed_artist_id, neighbour_artist_id) for tid in track_ids],
    )


def on_deezer(deezer: DeezerClient, h: HypemTrack, tolerance_s: int) -> DeezerTrack | None:
    """Le titre Deezer d'un titre Hype Machine, par la règle stricte de la bibliothèque, ou None
    s'il n'y est pas ou n'a pas d'extrait (le modèle lit l'extrait)."""
    found = pick_match(
        h.artist,
        h.title,
        h.duration_s * 1000,
        deezer.search_tracks(search_query(h.artist, h.title)),
        tolerance_s,
    )
    return found if found is not None and found.has_preview else None
