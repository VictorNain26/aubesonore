"""Nouveautés (docs/conception.md §3) : des titres récents choisis par des humains, ajoutés à la
dernière fournée et jugés par le modèle comme les voisins.

Chaque candidat garde sa source (et le blog ou le genre) : les votes d'examen jugent chaque
source. Un titre déjà dans la bibliothèque ou les favoris, même sous une autre version, n'est pas
une nouveauté.
Une source en panne est sautée et nommée, les autres continuent.
"""

import sqlite3
from collections import Counter
from dataclasses import dataclass, field

from radio.bibliotheque.doublons import dedupe_key
from radio.decouverte.candidats import ajouter_candidats, ajouter_titres, on_deezer
from radio.socle.config import NouveautesConfig
from radio.sources.deezer import DeezerClient, DeezerError, DeezerTrack
from radio.sources.hypem import HypemClient, HypemError, HypemUnavailable


class AucuneFourneeError(Exception):
    """Aucune fournée de découverte : les nouveautés s'y ajoutent, lancer radio decouverte."""


@dataclass
class RapportNouveautes:
    run_id: int
    seen: Counter[str] = field(default_factory=Counter)
    added: Counter[str] = field(default_factory=Counter)
    # Déjà candidats d'une fournée précédente : une source qui ne renouvelle pas sa sélection.
    already: Counter[str] = field(default_factory=Counter)
    n_unmatched: int = 0
    n_known: int = 0
    skipped: list[str] = field(default_factory=list)


def _known_keys(conn: sqlite3.Connection) -> set[str]:
    """Titres déjà connus de Victor : sa bibliothèque et ses favoris Hype Machine."""
    return {
        str(r[0])
        for r in conn.execute(
            "SELECT dedupe_key FROM titres WHERE provenance IN ('bibliotheque', 'favori')"
        )
    }


def _add(
    conn: sqlite3.Connection,
    rep: RapportNouveautes,
    known: set[str],
    track: DeezerTrack,
    source: str,
    detail: str,
    now: str,
) -> None:
    if dedupe_key(track.artist_name, track.title) in known:
        rep.n_known += 1
        return
    with conn:
        added = ajouter_titres(conn, track.artist_id, track.artist_name, [track], "candidat", now)
        ajouter_candidats(conn, rep.run_id, source, added, detail=detail)
    rep.added[source] += len(added)
    if not added:
        rep.already[source] += 1


def _hypem(
    conn: sqlite3.Connection,
    rep: RapportNouveautes,
    known: set[str],
    deezer: DeezerClient,
    hypem: HypemClient,
    cfg: NouveautesConfig,
    tolerance_s: int,
    now: str,
) -> None:
    for page in range(1, cfg.pages_hypem + 1):
        try:
            tracks = hypem.popular("lastweek", page)
        except (HypemError, HypemUnavailable) as e:
            rep.skipped.append(f"Hype Machine, page {page} ({type(e).__name__} : {e})")
            return
        for h in tracks:
            rep.seen["hypem"] += 1
            found = on_deezer(deezer, h, tolerance_s)
            if found is None:
                rep.n_unmatched += 1
                continue
            _add(conn, rep, known, found, "hypem", h.sitename, now)


def _deezer_editorial(
    conn: sqlite3.Connection,
    rep: RapportNouveautes,
    known: set[str],
    deezer: DeezerClient,
    cfg: NouveautesConfig,
    now: str,
) -> None:
    for name, genre_id in cfg.deezer_editorial.items():
        try:
            albums = deezer.editorial_selection(genre_id)
        except DeezerError as e:
            rep.skipped.append(f"Deezer éditorial {name} ({type(e).__name__} : {e})")
            continue
        for album_id in albums:
            tracks = [t for t in deezer.album_tracks(album_id) if t.has_preview]
            rep.seen["deezer_editorial"] += len(tracks)
            for t in sorted(tracks, key=lambda t: -t.rank)[: cfg.titres_par_album]:
                _add(conn, rep, known, t, "deezer_editorial", name, now)


def chercher_nouveautes(
    conn: sqlite3.Connection,
    deezer: DeezerClient,
    hypem: HypemClient,
    cfg: NouveautesConfig,
    tolerance_s: int,
    now: str,
) -> RapportNouveautes:
    row = conn.execute("SELECT MAX(fournee_id) FROM fournees").fetchone()
    if row[0] is None:
        raise AucuneFourneeError
    rep = RapportNouveautes(int(row[0]))
    known = _known_keys(conn)
    _hypem(conn, rep, known, deezer, hypem, cfg, tolerance_s, now)
    _deezer_editorial(conn, rep, known, deezer, cfg, now)
    return rep
