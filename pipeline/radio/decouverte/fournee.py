"""Passe de découverte : graines → voisins → titres candidats.

Erreur définitive sur un artiste, ou voisin sans titre : sauté, compté, nommé. Deezer ou
Last.fm indisponible : la passe s'arrête, le travail fait est gardé, aucune graine n'est marquée ;
la passe suivante reprend avec les mêmes graines. Une source qui répond vide partout est
indisponible, d'après les taux mesurés le 2026-10-04 : aucun artiste relié pour aucune graine
(9,5 % des artistes de la bibliothèque n'en ont pas sur Deezer), aucun similaire pour aucune
graine (2 % sur Last.fm), aucun titre pour aucun voisin (1 artiste relié sur 1 809 ; ce jour-là,
126 voisins sur 126 étaient vides).
"""

import logging
import sqlite3
from dataclasses import dataclass, field
from datetime import datetime

import numpy as np

from radio.bibliotheque.artistes import artistes_bibliotheque, noms_bibliotheque
from radio.decouverte.candidats import add_tracks, ajouter_candidats, keep_tracks
from radio.decouverte.graines import finish_run, start_run
from radio.decouverte.voisins import chercher_voisins
from radio.socle.config import DecouverteConfig
from radio.sources.deezer import DeezerClient, DeezerError, DeezerUnavailable
from radio.sources.lastfm import LastfmClient, LastfmError, LastfmUnavailable

logger = logging.getLogger(__name__)


class AucunArtisteBibliothequeError(Exception):
    """Aucun artiste de la bibliothèque n'est rapproché de Deezer : pas de graine possible."""


@dataclass
class RapportDecouverte:
    run_id: int
    resumed: bool
    n_seeds: int
    n_dropped: int
    n_neighbours: int = 0
    n_seen: int = 0
    n_added: int = 0
    n_duplicates: int = 0
    n_filtered: int = 0
    skipped: list[str] = field(default_factory=list)


def decouvrir(
    conn: sqlite3.Connection,
    deezer: DeezerClient,
    lastfm: LastfmClient,
    cfg: DecouverteConfig,
    now: datetime,
    rng: np.random.Generator,
) -> RapportDecouverte:
    artists = artistes_bibliotheque(conn)
    if not artists:
        raise AucunArtisteBibliothequeError("no library artist matched on Deezer")
    run = start_run(conn, artists, cfg, now, rng)
    exclude_ids = {a.deezer_artist_id for a in artists}
    exclude_names = noms_bibliotheque(conn)
    rep = RapportDecouverte(run.run_id, run.resumed, len(run.seeds), run.n_dropped)
    seen: set[int] = set()
    stamp = now.isoformat()
    answered = no_related = no_similar = 0
    for i, seed in enumerate(run.seeds, 1):
        logger.info("discover: seed %d/%d", i, len(run.seeds))
        try:
            found = chercher_voisins(
                seed, deezer, lastfm, cfg.similaires_lastfm, exclude_ids, exclude_names
            )
        except (DeezerUnavailable, LastfmUnavailable):
            logger.warning("discover: stopped at seed %s (%d)", seed.name, seed.deezer_artist_id)
            raise
        except (DeezerError, LastfmError) as e:
            rep.skipped.append(f"{seed.name} ({type(e).__name__})")
            continue
        answered += 1
        no_related += not found.n_related
        no_similar += not found.n_similar
        for n in found.artists:
            if n.id in seen:
                continue
            seen.add(n.id)
            rep.n_neighbours += 1
            try:
                top = deezer.top(n.id, cfg.titres_par_voisin)
            except DeezerUnavailable:
                logger.warning("discover: stopped at neighbour %s (%d)", n.name, n.id)
                raise
            except DeezerError as e:
                rep.skipped.append(f"{n.name} ({type(e).__name__})")
                continue
            if not top:
                rep.skipped.append(f"{n.name} (aucun titre sur Deezer)")
                continue
            kept = keep_tracks(top, n.id)
            with conn:
                added = add_tracks(conn, n.id, n.name, kept, "candidate", stamp)
                ajouter_candidats(
                    conn,
                    run.run_id,
                    "voisin",
                    added,
                    seed_artist_id=seed.deezer_artist_id,
                    neighbour_artist_id=n.id,
                )
            rep.n_seen += len(top)
            rep.n_filtered += len(top) - len(kept)
            rep.n_added += len(added)
            rep.n_duplicates += len(kept) - len(added)
    if answered and no_related == answered:
        raise DeezerUnavailable(f"aucun artiste relié pour {answered} graines")
    if answered and no_similar == answered:
        raise LastfmUnavailable(f"aucun artiste similaire pour {answered} graines")
    if rep.n_neighbours and not rep.n_seen:
        raise DeezerUnavailable(f"aucun titre pour {rep.n_neighbours} voisins")
    finish_run(conn, run.run_id, now)
    return rep
