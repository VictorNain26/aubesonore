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

from radio.decouverte.candidats import ajouter_titres, on_deezer
from radio.sources.deezer import DeezerClient
from radio.sources.hypem import HypemClient


@dataclass
class RapportFavoris:
    n_seen: int
    n_matched: int = 0
    n_unmatched: int = 0
    n_library: int = 0
    n_dropped: int = 0


def importer_favoris(
    conn: sqlite3.Connection,
    deezer: DeezerClient,
    hypem: HypemClient,
    user: str,
    tolerance_s: int,
    now: str,
) -> RapportFavoris:
    favorites = hypem.favorites(user)
    rep = RapportFavoris(n_seen=len(favorites))
    kept: set[int] = set()
    for h in favorites:
        found = on_deezer(deezer, h, tolerance_s)
        if found is None:
            rep.n_unmatched += 1
            continue
        kept.add(found.id)
        with conn:
            ajouter_titres(conn, found.artist_id, found.artist_name, [found], "favori", now)
            # Un candidat déjà aimé n'est plus une découverte. OR IGNORE : une autre version du
            # même titre est déjà favorite, celui-ci reste candidat.
            conn.execute(
                "UPDATE OR IGNORE titres SET provenance = 'favori' "
                "WHERE titre_id = ? AND provenance = 'candidat'",
                (found.id,),
            )
    rep.n_matched = len(kept)
    library = {
        int(r[0])
        for r in conn.execute("SELECT titre_id FROM titres WHERE provenance = 'bibliotheque'")
    }
    rep.n_library = len(kept & library)

    # Un favori retiré : redevenu candidat s'il venait d'une fournée, sinon oublié.
    dropped = [
        int(r[0])
        for r in conn.execute("SELECT titre_id FROM titres WHERE provenance = 'favori'")
        if int(r[0]) not in kept
    ]
    with conn:
        for tid in dropped:
            if conn.execute("SELECT 1 FROM candidats WHERE titre_id = ?", (tid,)).fetchone():
                conn.execute(
                    "UPDATE OR IGNORE titres SET provenance = 'candidat' WHERE titre_id = ?",
                    (tid,),
                )
            else:
                conn.execute("DELETE FROM titres WHERE titre_id = ?", (tid,))
    rep.n_dropped = len(dropped)
    return rep
