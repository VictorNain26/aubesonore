"""Voisins d'une graine : Deezer related ∩ Last.fm getSimilar, moins la bibliothèque.

Les deux sources se croisent sur le nom normalisé (Last.fm ne donne que des noms). Un voisin
n'est jamais un artiste de la bibliothèque : exclusion par id Deezer et par nom.
"""

from dataclasses import dataclass

from radio.library.artists import LibraryArtist
from radio.library.match import normalize
from radio.sources.deezer import DeezerArtist, DeezerClient
from radio.sources.lastfm import LastfmClient


@dataclass(frozen=True)
class Neighbours:
    artists: list[DeezerArtist]
    # Taille de chaque réponse : une source qui répond vide pour toutes les graines est en panne.
    n_related: int
    n_similar: int


def neighbours(
    seed: LibraryArtist,
    deezer: DeezerClient,
    lastfm: LastfmClient,
    similar_limit: int,
    exclude_ids: set[int],
    exclude_names: frozenset[str],
) -> Neighbours:
    names = lastfm.similar_artists(seed.name, limit=similar_limit)
    similar = {normalize(s) for s in names}
    similar.discard("")
    related = deezer.related(seed.deezer_artist_id)
    out = []
    for a in related:
        n = normalize(a.name)
        if n in similar and a.id not in exclude_ids and n not in exclude_names:
            out.append(a)
    return Neighbours(out, len(related), len(names))
