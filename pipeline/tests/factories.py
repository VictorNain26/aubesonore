"""Mini-bibliothèque et faux de la page de vote, partagés par les tests."""

import sqlite3
from pathlib import Path

import jwt

from radio.core.db import connect
from radio.library.sync import sync_library
from radio.sources.deezer import DeezerTrack
from radio.sources.plex import PlexTrack
from radio.votes.access import HEADER

SIGNED = "https://cdnt-preview.dzcdn.net/api/1/1/a/b/c/0/x.mp3?hdnea=exp=1~acl=*~hmac=SIGNE"
TOKEN = "bon-jeton"
OK = {HEADER: TOKEN}


class PreviewDeezer:
    """Le Deezer de la page de vote : un extrait signé de 7 octets, ou la panne `fail`."""

    def __init__(self, fail: Exception | None = None, preview: str | None = SIGNED) -> None:
        self.fail = fail
        self.preview = preview
        self.urls: list[str] = []

    def track(self, track_id: int) -> tuple[DeezerTrack, str | None] | None:
        if self.fail is not None:
            raise self.fail
        t = DeezerTrack(track_id, "T", "T", 30, 1, 1, "A", self.preview is not None)
        return t, self.preview

    def download(self, url: str) -> bytes:
        self.urls.append(url)
        return b"ID3-mp3"


def verify(token: str) -> None:
    """Cloudflare Access : seul `OK` passe."""
    if token != TOKEN:
        raise jwt.InvalidTokenError("refusé")


def make_library(directory: Path) -> sqlite3.Connection:
    """M83 (Deezer 83 : titres 101, 102, 103), Wire (70 : 104), Obscure Band jamais rapproché."""
    conn = connect(directory / "radio.db")
    sync_library(
        conn,
        [
            PlexTrack("1", "M83", "Midnight City", "Hurry Up", 243000, 10),
            PlexTrack("2", "M83 feat. Susanne Sundfør", "For the Kids", "Junk", 280000, 3),
            PlexTrack("3", "M83", "Wait", "Hurry Up", 343000, 0),
            PlexTrack("4", "Wire", "Mannequin", "Pink Flag", 157000, 1),
            PlexTrack("5", "Obscure Band", "Demo", "Tape", 100000, 7),
        ],
        "d1",
    )
    conn.executemany(
        "INSERT INTO deezer_matches VALUES (?, ?, ?, ?, ?, 'd1')",
        [
            ("1", "matched", None, 101, 83),
            ("2", "matched", None, 102, 83),
            ("3", "matched", None, 103, 83),
            ("4", "matched", None, 104, 70),
            ("5", "unmatched", "no_result", None, None),
        ],
    )
    conn.commit()
    return conn
