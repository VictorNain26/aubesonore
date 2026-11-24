"""Négatifs faibles de démarrage : les titres des artistes de config/negatives.toml.

Ils sont lus et mesurés comme les candidats (10 titres, artiste principal, extrait présent) ;
leur poids à l'entraînement se décide plus tard, sur les votes.
"""

import sqlite3
import tomllib
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from radio.bibliotheque.artistes import artistes_bibliotheque
from radio.decouverte.candidats import ajouter_titres, garder_titres
from radio.sources.deezer import DeezerClient, DeezerError


class ArtisteNegatif(BaseModel):
    model_config = ConfigDict(extra="ignore", frozen=True)
    name: str
    deezer_id: int = Field(gt=0)
    category: Literal["commercial_fr", "commercial_intl", "metal", "hard_techno"]


class _File(BaseModel):
    model_config = ConfigDict(extra="forbid")
    artist: list[ArtisteNegatif]


@dataclass
class RapportNegatifs:
    n_artists: int
    n_already: int = 0
    n_added: int = 0
    n_duplicates: int = 0
    n_filtered: int = 0
    skipped: list[str] = field(default_factory=list)


def charger_negatifs(path: Path) -> list[ArtisteNegatif]:
    with path.open("rb") as f:
        negatives = _File.model_validate(tomllib.load(f)).artist
    doubles = [i for i, n in Counter(a.deezer_id for a in negatives).items() if n > 1]
    if doubles:
        raise ValueError(f"deezer_id en double : {doubles}")
    return negatives


def importer_negatifs(
    conn: sqlite3.Connection,
    deezer: DeezerClient,
    negatives: list[ArtisteNegatif],
    per_artist: int,
    now: str,
) -> RapportNegatifs:
    done = {r[0] for r in conn.execute("SELECT artiste_id FROM artistes_negatifs")}
    library_ids = {a.deezer_artist_id for a in artistes_bibliotheque(conn)}
    rep = RapportNegatifs(n_artists=len(negatives))
    for n in negatives:
        if n.deezer_id in done:
            rep.n_already += 1
            continue
        if n.deezer_id in library_ids:
            # Un négatif présent dans la bibliothèque serait une étiquette empoisonnée.
            rep.skipped.append(f"{n.name} (dans la bibliothèque)")
            continue
        try:
            top = deezer.top(n.deezer_id, per_artist)
        except DeezerError as e:
            rep.skipped.append(f"{n.name} ({type(e).__name__})")
            continue
        kept = garder_titres(top, n.deezer_id)
        with conn:
            added = ajouter_titres(conn, n.deezer_id, n.name, kept, "negatif", now)
            conn.execute("INSERT INTO artistes_negatifs VALUES (?, ?)", (n.deezer_id, n.category))
        rep.n_added += len(added)
        rep.n_duplicates += len(kept) - len(added)
        rep.n_filtered += len(top) - len(kept)
    return rep
