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
        SELECT m.deezer_artist_id AS aid, t.artist AS name
        FROM deezer_matches m JOIN library_tracks t USING (plex_key)
        WHERE m.status = 'matched'
        """
    ):
        names[r["aid"]][r["name"]] += 1
    plays = {
        r["artist"]: r["p"]
        for r in conn.execute("SELECT artist, SUM(plays) AS p FROM library_tracks GROUP BY artist")
    }
    out = []
    for aid, c in sorted(names.items()):
        # Le nom le plus fréquent, puis l'ordre alphabétique : déterministe.
        name = min(c, key=lambda n: (-c[n], n))
        out.append(ArtisteBibliotheque(aid, name, sum(plays[n] for n in c)))
    return out


def noms_bibliotheque(conn: sqlite3.Connection) -> frozenset[str]:
    """Noms normalisés de tous les artistes Plex et Deezer rapprochés.

    Les noms Deezer ne couvrent que les artistes déjà enregistrés dans la table `artists`
    (ce qui survient après la lecture Deezer en tâche ultérieure) ; la garantie primaire est
    l'exclusion par id Deezer ET par noms normalisés Plex (rapprochés ou non).
    """
    names = {normalize(r[0]) for r in conn.execute("SELECT DISTINCT artist FROM library_tracks")}
    names |= {
        normalize(r[0])
        for r in conn.execute(
            """
            SELECT name FROM artists WHERE deezer_artist_id IN
                (SELECT deezer_artist_id FROM deezer_matches WHERE status = 'matched')
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
        SELECT m.deezer_track_id AS tid, m.deezer_artist_id AS aid, t.title AS title,
               t.artist AS artist
        FROM deezer_matches m JOIN library_tracks t USING (plex_key)
        WHERE m.status = 'matched' ORDER BY t.plex_key
        """
    ):
        first.setdefault(r["tid"], (r["aid"], dedupe_key(r["artist"], r["title"])))
    titles = {
        r["tid"]: r["title"]
        for r in conn.execute(
            """
            SELECT m.deezer_track_id AS tid, MIN(t.title) AS title
            FROM deezer_matches m JOIN library_tracks t USING (plex_key)
            WHERE m.status = 'matched' GROUP BY m.deezer_track_id
            """
        )
    }
    with conn:
        conn.executemany(
            "INSERT INTO artists (deezer_artist_id, name) VALUES (?, ?) ON CONFLICT DO NOTHING",
            [(a.deezer_artist_id, a.name) for a in artists],
        )
        removed = conn.execute(
            """
            DELETE FROM tracks WHERE origin = 'library' AND deezer_track_id NOT IN
                (SELECT deezer_track_id FROM deezer_matches WHERE status = 'matched')
            """
        ).rowcount
        # Un titre déjà connu comme candidat ou négatif devient un titre de la bibliothèque.
        conn.executemany(
            """
            INSERT INTO tracks (deezer_track_id, deezer_artist_id, title, origin, dedupe_key,
                                added_at)
            VALUES (?, ?, ?, 'library', ?, ?)
            ON CONFLICT (deezer_track_id) DO UPDATE SET origin = 'library', title = excluded.title,
                dedupe_key = excluded.dedupe_key
            """,
            [(tid, aid, titles[tid], key, now) for tid, (aid, key) in sorted(first.items())],
        )
    return RapportArtistes(len(first), len(artists), removed)
