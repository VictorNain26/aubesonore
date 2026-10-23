"""Favoris Hype Machine de Victor (docs/conception.md §3.2).

Retrouvés sur Deezer par la règle stricte de la bibliothèque, ils prennent l'origine `favorite` :
un titre déjà aimé n'est plus une découverte (un candidat qui en devient un sort de la
fournée), et la part des favoris que retiendrait le modèle mesure son goût. Ils n'entraînent pas
le modèle : en exemples positifs, l'AUC d'examen n'a pas monté
(recherches/2026-10-02-favoris-hypem.md).
La bibliothèque garde la priorité : un favori déjà dans Plex reste `library`.
"""

import sqlite3
from dataclasses import dataclass

from radio.discover.candidates import add_tracks
from radio.library.match import pick_match, search_query
from radio.sources.deezer import DeezerClient
from radio.sources.hypem import HypemClient


@dataclass
class FavoritesReport:
    n_seen: int
    n_matched: int = 0
    n_unmatched: int = 0
    n_library: int = 0
    n_dropped: int = 0


def favorites_pass(
    conn: sqlite3.Connection,
    deezer: DeezerClient,
    hypem: HypemClient,
    user: str,
    tolerance_s: int,
    now: str,
) -> FavoritesReport:
    favorites = hypem.favorites(user)
    rep = FavoritesReport(n_seen=len(favorites))
    kept: set[int] = set()
    for h in favorites:
        found = pick_match(
            h.artist,
            h.title,
            h.duration_s * 1000,
            deezer.search_tracks(search_query(h.artist, h.title)),
            tolerance_s,
        )
        if found is None or not found.has_preview:
            rep.n_unmatched += 1
            continue
        kept.add(found.id)
        with conn:
            add_tracks(conn, found.artist_id, found.artist_name, [found], "favorite", now)
            # Un candidat déjà aimé n'est plus une découverte. OR IGNORE : une autre version du
            # même titre est déjà favorite, celui-ci reste candidat.
            conn.execute(
                "UPDATE OR IGNORE tracks SET origin = 'favorite' "
                "WHERE deezer_track_id = ? AND origin = 'candidate'",
                (found.id,),
            )
    rep.n_matched = len(kept)
    library = {
        int(r[0])
        for r in conn.execute("SELECT deezer_track_id FROM tracks WHERE origin = 'library'")
    }
    rep.n_library = len(kept & library)

    # Un favori retiré : redevenu candidat s'il venait d'une fournée, sinon oublié.
    dropped = [
        int(r[0])
        for r in conn.execute("SELECT deezer_track_id FROM tracks WHERE origin = 'favorite'")
        if int(r[0]) not in kept
    ]
    with conn:
        for tid in dropped:
            if conn.execute(
                "SELECT 1 FROM candidates WHERE deezer_track_id = ?", (tid,)
            ).fetchone():
                conn.execute(
                    "UPDATE OR IGNORE tracks SET origin = 'candidate' WHERE deezer_track_id = ?",
                    (tid,),
                )
            else:
                conn.execute("DELETE FROM tracks WHERE deezer_track_id = ?", (tid,))
    rep.n_dropped = len(dropped)
    return rep
