from pathlib import Path

import pytest

from radio.core.db import connect
from radio.library.sync import EmptyLibraryError, SyncReport, sync_library
from radio.sources.plex import PlexTrack


def t(key: str, title: str = "T", plays: int = 0, duration: int | None = 200000) -> PlexTrack:
    return PlexTrack(key, "Wire", title, "Pink Flag", duration, plays)


def test_first_sync_adds_everything(tmp_path: Path) -> None:
    conn = connect(tmp_path / "db")
    rep = sync_library(conn, [t("1"), t("2")], "2026-09-24T00:00:00Z")
    assert rep == SyncReport(n_tracks=2, n_added=2, n_changed=0, n_removed=0)
    assert conn.execute("SELECT COUNT(*) FROM library_tracks").fetchone()[0] == 2


def test_changed_track_drops_its_match(tmp_path: Path) -> None:
    conn = connect(tmp_path / "db")
    sync_library(conn, [t("1"), t("2")], "d1")
    conn.execute(
        "INSERT INTO deezer_matches VALUES ('1', 'matched', NULL, 10, 20, 'd1'),"
        " ('2', 'matched', NULL, 11, 20, 'd1')"
    )
    rep = sync_library(conn, [t("1", title="Autre"), t("2", plays=9)], "d2")
    assert rep == SyncReport(n_tracks=2, n_added=0, n_changed=1, n_removed=0)
    keys = {r[0] for r in conn.execute("SELECT plex_key FROM deezer_matches")}
    assert keys == {"2"}
    assert conn.execute("SELECT plays FROM library_tracks WHERE plex_key='2'").fetchone()[0] == 9


def test_removed_track_cascades(tmp_path: Path) -> None:
    conn = connect(tmp_path / "db")
    sync_library(conn, [t("1"), t("2")], "d1")
    conn.execute("INSERT INTO deezer_matches VALUES ('2', 'matched', NULL, 11, 20, 'd1')")
    rep = sync_library(conn, [t("1")], "d2")
    assert rep.n_removed == 1
    assert conn.execute("SELECT COUNT(*) FROM deezer_matches").fetchone()[0] == 0


def test_empty_library_refused_and_nothing_written(tmp_path: Path) -> None:
    conn = connect(tmp_path / "db")
    sync_library(conn, [t("1")], "d1")
    with pytest.raises(EmptyLibraryError):
        sync_library(conn, [], "d2")
    assert conn.execute("SELECT COUNT(*) FROM library_tracks").fetchone()[0] == 1
