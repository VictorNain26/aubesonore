import sqlite3
from pathlib import Path

from radio.core.config import FreshConfig
from radio.votes.suivi import load_suivi, suivi_lines
from tests.model_factory import add_vote, make_model_db, serve_scores


def _db(tmp_path: Path) -> sqlite3.Connection:
    conn = make_model_db(tmp_path)
    serve_scores(conn)
    # Dernière fournée : les rejetés deviennent la sélection jazz de Deezer.
    conn.execute(
        "UPDATE candidates SET source = 'deezer_editorial', seed_artist_id = NULL, "
        "neighbour_artist_id = NULL, detail = 'jazz' WHERE deezer_track_id >= 300600"
    )
    conn.commit()
    return conn


def test_the_flow_of_each_source_from_batch_to_antenna(tmp_path: Path) -> None:
    conn = _db(tmp_path)
    conn.executemany(
        "INSERT INTO acquisitions VALUES (?, ?, ?, 1, ?, 'd')",
        [
            (200600, "published", None, None),
            (200601, "ready", None, "f"),
            (200602, "failed", "x", None),
        ],
    )
    conn.execute(
        "INSERT INTO antenne VALUES (200600, 'decouverte', 'decouvertes', 1, 's', "
        "'antenne/1.mp3', 'd', 'd')"
    )
    conn.commit()
    s = load_suivi(conn, FreshConfig(hypem_pages=0, deezer_editorial={"jazz": 129}))
    flows = {f.key: f for f in s.flows}
    assert s.run_id == 2
    v = flows["voisin"]
    assert (v.candidates, v.retained, v.ready, v.failed, v.on_air) == (24, 24, 2, 1, 1)
    assert flows["deezer_editorial · jazz"].retained == 0
    assert s.to_adjust == []
    assert "  voisin : 24 → 24 → 2 (1) → 1" in suivi_lines(s)


def test_what_needs_adjusting_is_named_with_its_rule(tmp_path: Path) -> None:
    conn = _db(tmp_path)
    jazz = [a * 100 + k for a in range(3006, 3012) for k in range(4)]
    for i, t in enumerate(jazz):
        add_vote(conn, t, "exam", "oui" if i < 2 else "non")
    voisins = [a * 100 + k for a in range(2000, 2005) for k in range(4)]
    for i, t in enumerate(voisins):
        add_vote(conn, t, "exam", "oui" if i < 18 else "non")
    conn.executemany(
        "INSERT INTO acquisitions VALUES (?, 'failed', 'aucun résultat', 1, NULL, 'd')",
        [(a * 100 + k,) for a in range(2006, 2009) for k in range(4)][:10],
    )
    conn.commit()
    s = load_suivi(conn, FreshConfig(hypem_pages=3, deezer_editorial={"jazz": 129, "rock": 152}))
    assert (
        "deezer_editorial · jazz : 2 oui sur 24 votes d'examen, nettement sous le reste "
        "(90 %) : à retirer ou remplacer" in s.to_adjust
    )
    assert not any(a.startswith("voisin : 18 oui") for a in s.to_adjust)
    assert "deezer_editorial · rock : rien de neuf dans la dernière fournée" in s.to_adjust
    assert "hypem : rien de neuf dans la dernière fournée" in s.to_adjust
    assert "voisin : 10 retenus introuvables sur 10 tentés (Soulseek)" in s.to_adjust
