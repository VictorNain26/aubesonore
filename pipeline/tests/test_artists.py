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
    rows = conn.execute("SELECT titre_id, artiste_id, provenance FROM titres ORDER BY 1").fetchall()
    assert [tuple(r) for r in rows] == [
        (101, 83, "bibliotheque"),
        (102, 83, "bibliotheque"),
        (103, 83, "bibliotheque"),
        (104, 70, "bibliotheque"),
    ]
    assert enregistrer_bibliotheque(conn, "d3") == RapportArtistes(
        n_tracks=4, n_artists=2, n_removed=0
    )


def test_register_claims_candidates_and_drops_lost_matches(tmp_path: Path) -> None:
    conn = make_library(tmp_path)
    conn.execute("INSERT INTO artistes (artiste_id, name) VALUES (70, 'Wire')")
    conn.execute("INSERT INTO titres VALUES (104, 70, 'Mannequin', 'candidat', 'wire|m', 'd0')")
    enregistrer_bibliotheque(conn, "d2")
    row = conn.execute(
        "SELECT provenance, title, dedupe_key FROM titres WHERE titre_id = 104"
    ).fetchone()
    assert row["provenance"] == "bibliotheque"
    assert row["title"] == "Mannequin"
    assert row["dedupe_key"] == "wire|mannequin"
    conn.execute("DELETE FROM rapprochements WHERE plex_key = '4'")
    conn.commit()
    assert enregistrer_bibliotheque(conn, "d3").n_removed == 1
    assert conn.execute("SELECT COUNT(*) FROM titres WHERE titre_id = 104").fetchone()[0] == 0
