"""Synchronisation Plex → library_tracks. Plex fait autorité ; la base est un reflet."""

import sqlite3
from dataclasses import dataclass

from radio.sources.plex import PlexTrack


class EmptyLibraryError(Exception):
    """Plex n'a renvoyé aucun titre : on refuse d'effacer la bibliothèque connue."""


@dataclass(frozen=True)
class SyncReport:
    n_tracks: int
    n_added: int
    n_changed: int
    n_removed: int


def sync_library(conn: sqlite3.Connection, tracks: list[PlexTrack], now: str) -> SyncReport:
    if not tracks:
        raise EmptyLibraryError("Plex returned no track")
    known = {
        r["plex_key"]: (r["artist"], r["title"], r["duration_ms"])
        for r in conn.execute("SELECT plex_key, artist, title, duration_ms FROM library_tracks")
    }
    incoming = {t.key: t for t in tracks}
    added = [t for t in tracks if t.key not in known]
    changed = [
        t for t in tracks if t.key in known and known[t.key] != (t.artist, t.title, t.duration_ms)
    ]
    removed = [k for k in known if k not in incoming]
    with conn:
        conn.executemany(
            "DELETE FROM deezer_matches WHERE plex_key = ?", [(t.key,) for t in changed]
        )
        conn.executemany("DELETE FROM library_tracks WHERE plex_key = ?", [(k,) for k in removed])
        conn.executemany(
            """
            INSERT INTO library_tracks
                (plex_key, artist, title, album, duration_ms, plays, synced_at, file)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (plex_key) DO UPDATE SET
                artist = excluded.artist, title = excluded.title, album = excluded.album,
                duration_ms = excluded.duration_ms, plays = excluded.plays,
                synced_at = excluded.synced_at, file = excluded.file
            """,
            [
                (t.key, t.artist, t.title, t.album, t.duration_ms, t.plays, now, t.file)
                for t in tracks
            ],
        )
    return SyncReport(len(tracks), len(added), len(changed), len(removed))
