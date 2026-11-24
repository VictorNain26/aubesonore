"""Artistes de la bibliothèque (identité : id Deezer) et inscription des titres rapprochés.

Un artiste de la bibliothèque est un artiste Deezer dont au moins un titre Plex est rapproché.
Ses écoutes comptent tous les titres Plex qui portent l'un de ses noms (« M83 » et
« M83 feat. X »), rapprochés ou non.
"""

import sqlite3
from collections import Counter, defaultdict
from dataclasses import dataclass

from radio.bibliotheque.doublons import dedupe_key
from radio.bibliotheque.rapprochement import normalize


@dataclass(frozen=True)
class ArtisteBibliotheque:
    deezer_artist_id: int
    name: str
    plays: int


@dataclass(frozen=True)
class RapportArtistes:
    n_tracks: int
    n_artists: int
    n_removed: int


def artistes_bibliotheque(conn: sqlite3.Connection) -> list[ArtisteBibliotheque]:
    names: defaultdict[int, Counter[str]] = defaultdict(Counter)
    for r in conn.execute(
        """
        SELECT m.artiste_id AS aid, t.artist AS name
        FROM rapprochements m JOIN bibliotheque t USING (plex_key)
        WHERE m.status = 'trouve'
        """
    ):
        names[r["aid"]][r["name"]] += 1
    plays = {
        r["artist"]: r["p"]
        for r in conn.execute("SELECT artist, SUM(plays) AS p FROM bibliotheque GROUP BY artist")
    }
    out = []
    for aid, c in sorted(names.items()):
        # Le nom le plus fréquent, puis l'ordre alphabétique : déterministe.
        name = min(c, key=lambda n: (-c[n], n))
        out.append(ArtisteBibliotheque(aid, name, sum(plays[n] for n in c)))
    return out


def noms_bibliotheque(conn: sqlite3.Connection) -> frozenset[str]:
    """Noms normalisés de tous les artistes Plex et Deezer rapprochés.

    Les noms Deezer ne couvrent que les artistes déjà enregistrés dans la table `artistes`
    (ce qui survient après la lecture Deezer en tâche ultérieure) ; la garantie primaire est
    l'exclusion par id Deezer ET par noms normalisés Plex (rapprochés ou non).
    """
    names = {normalize(r[0]) for r in conn.execute("SELECT DISTINCT artist FROM bibliotheque")}
    names |= {
        normalize(r[0])
        for r in conn.execute(
            """
            SELECT name FROM artistes WHERE artiste_id IN
                (SELECT artiste_id FROM rapprochements WHERE status = 'trouve')
            """
        )
    }
    names.discard("")
    return frozenset(names)


def enregistrer_bibliotheque(conn: sqlite3.Connection, now: str) -> RapportArtistes:
    artists = artistes_bibliotheque(conn)
    first: dict[int, tuple[int, str]] = {}
    for r in conn.execute(
        """
        SELECT m.titre_id AS tid, m.artiste_id AS aid, t.title AS title,
               t.artist AS artist
        FROM rapprochements m JOIN bibliotheque t USING (plex_key)
        WHERE m.status = 'trouve' ORDER BY t.plex_key
        """
    ):
        first.setdefault(r["tid"], (r["aid"], dedupe_key(r["artist"], r["title"])))
    titles = {
        r["tid"]: r["title"]
        for r in conn.execute(
            """
            SELECT m.titre_id AS tid, MIN(t.title) AS title
            FROM rapprochements m JOIN bibliotheque t USING (plex_key)
            WHERE m.status = 'trouve' GROUP BY m.titre_id
            """
        )
    }
    with conn:
        conn.executemany(
            "INSERT INTO artistes (artiste_id, name) VALUES (?, ?) ON CONFLICT DO NOTHING",
            [(a.deezer_artist_id, a.name) for a in artists],
        )
        removed = conn.execute(
            """
            DELETE FROM titres WHERE provenance = 'bibliotheque' AND titre_id NOT IN
                (SELECT titre_id FROM rapprochements WHERE status = 'trouve')
            """
        ).rowcount
        # Un titre déjà connu comme candidat ou négatif devient un titre de la bibliothèque.
        conn.executemany(
            """
            INSERT INTO titres (titre_id, artiste_id, title, provenance, dedupe_key,
                                added_at)
            VALUES (?, ?, ?, 'bibliotheque', ?, ?)
            ON CONFLICT (titre_id) DO UPDATE SET provenance = 'bibliotheque',
                title = excluded.title,
                dedupe_key = excluded.dedupe_key
            """,
            [(tid, aid, titles[tid], key, now) for tid, (aid, key) in sorted(first.items())],
        )
    return RapportArtistes(len(first), len(artists), removed)
