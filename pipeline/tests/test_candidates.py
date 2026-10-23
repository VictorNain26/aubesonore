from pathlib import Path

from radio.core.db import connect
from radio.discover.candidates import add_tracks, keep_tracks
from radio.sources.deezer import DeezerTrack


def dt(tid: int, title: str = "Song", artist_id: int = 1, preview: bool = True) -> DeezerTrack:
    return DeezerTrack(tid, title, title, 200, 1000, artist_id, "Knife", preview)


def test_keep_tracks_by_main_artist_with_preview() -> None:
    kept = keep_tracks([dt(1), dt(2, artist_id=9), dt(3, preview=False)], 1)
    assert [t.id for t in kept] == [1]


def test_add_tracks_dedupes(tmp_path: Path) -> None:
    conn = connect(tmp_path / "radio.db")
    with conn:
        added = add_tracks(
            conn,
            1,
            "Knife",
            [dt(1, "Heartbeats"), dt(2, "Heartbeats (Remastered)"), dt(3, "Silent Shout")],
            "candidate",
            "d",
        )
    assert added == [1, 3]
    with conn:
        assert add_tracks(conn, 1, "Knife", [dt(1, "Heartbeats")], "candidate", "d") == []
        assert add_tracks(conn, 1, "Knife", [dt(4, "Heartbeats")], "negative", "d") == [4]
    name = conn.execute("SELECT name FROM artists WHERE deezer_artist_id = 1").fetchone()[0]
    assert name == "Knife"
