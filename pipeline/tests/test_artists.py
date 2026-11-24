from pathlib import Path

from radio.bibliotheque.artistes import (
    ArtisteBibliotheque,
    RapportArtistes,
    artistes_bibliotheque,
    enregistrer_bibliotheque,
    noms_bibliotheque,
)
from tests.factories import make_library


def test_library_artists(tmp_path: Path) -> None:
    conn = make_library(tmp_path)
    assert artistes_bibliotheque(conn) == [
        ArtisteBibliotheque(70, "Wire", 1),
        ArtisteBibliotheque(83, "M83", 13),
    ]


def test_library_names_include_unmatched_artists(tmp_path: Path) -> None:
    conn = make_library(tmp_path)
    assert noms_bibliotheque(conn) == frozenset({"m83", "wire", "obscure band"})


def test_register_library(tmp_path: Path) -> None:
    conn = make_library(tmp_path)
    assert enregistrer_bibliotheque(conn, "d2") == RapportArtistes(
        n_tracks=4, n_artists=2, n_removed=0
    )
    rows = conn.execute(
        "SELECT deezer_track_id, deezer_artist_id, origin FROM tracks ORDER BY 1"
    ).fetchall()
    assert [tuple(r) for r in rows] == [
        (101, 83, "library"),
        (102, 83, "library"),
        (103, 83, "library"),
        (104, 70, "library"),
    ]
    assert enregistrer_bibliotheque(conn, "d3") == RapportArtistes(
        n_tracks=4, n_artists=2, n_removed=0
    )


def test_register_claims_candidates_and_drops_lost_matches(tmp_path: Path) -> None:
    conn = make_library(tmp_path)
    conn.execute("INSERT INTO artists (deezer_artist_id, name) VALUES (70, 'Wire')")
    conn.execute("INSERT INTO tracks VALUES (104, 70, 'Mannequin', 'candidate', 'wire|m', 'd0')")
    enregistrer_bibliotheque(conn, "d2")
    row = conn.execute(
        "SELECT origin, title, dedupe_key FROM tracks WHERE deezer_track_id = 104"
    ).fetchone()
    assert row["origin"] == "library"
    assert row["title"] == "Mannequin"
    assert row["dedupe_key"] == "wire|mannequin"
    conn.execute("DELETE FROM deezer_matches WHERE plex_key = '4'")
    conn.commit()
    assert enregistrer_bibliotheque(conn, "d3").n_removed == 1
    assert (
        conn.execute("SELECT COUNT(*) FROM tracks WHERE deezer_track_id = 104").fetchone()[0] == 0
    )
