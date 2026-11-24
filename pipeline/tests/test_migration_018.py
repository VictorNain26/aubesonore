"""Migration 018 : la base prend les noms du vocabulaire (pipeline/docs/conception.md).

Une base montée par 001-017, remplie de lignes qui couvrent chaque valeur de chaque CHECK, est
migrée ; chaque table d'après doit être la table d'avant passée par la correspondance du
vocabulaire, ligne à ligne. Ce fichier part une fois 018 passée en production
(.claude/rules/tests.md)."""

import shutil
import sqlite3
from pathlib import Path

import pytest

from radio.socle.db import MIGRATIONS, connect

TABLES = {
    "library_tracks": "bibliotheque",
    "deezer_matches": "rapprochements",
    "artists": "artistes",
    "tracks": "titres",
    "discover_runs": "fournees",
    "run_seeds": "graines",
    "candidates": "candidats",
    "negative_artists": "artistes_negatifs",
    "track_measures": "empreintes",
    "models": "modeles",
    "scores": "notes",
    "selections": "tirages",
    "ballots": "bulletins",
    "acquisitions": "telechargements",
    "repere_sorties": "reperes_sortis",
    "track_features": "mesures",
    "stage_reports": "rapports",
    "antenne": "antenne",
    "grille": "grille",
    "votes": "votes",
}

COLUMNS = {
    "deezer_track_id": "titre_id",
    "deezer_artist_id": "artiste_id",
    "run_id": "fournee_id",
    "origin": "provenance",
    "kind": "type",
    "accepted": "retenu",
    "retained": "retenu",
    "floored": "sous_plancher",
    "selection_id": "tirage_id",
    "model_id": "modele_id",
    "report_id": "rapport_id",
    "arousal": "energie",
    "arousal_start": "energie_start",
    "arousal_end": "energie_end",
    "bpm": "tempo",
    "bpm_start": "tempo_start",
    "bpm_end": "tempo_end",
}

KIND = {"exam": "examen", "lesson": "lecon"}
VALUES = {
    ("titres", "provenance"): {
        "library": "bibliotheque",
        "candidate": "candidat",
        "negative": "negatif",
        "favorite": "favori",
    },
    ("antenne", "provenance"): {"decouverte": "telecharge", "repere": "repere"},
    ("telechargements", "status"): {"ready": "pret", "failed": "echec", "published": "publie"},
    ("rapprochements", "status"): {"matched": "trouve", "unmatched": "non_trouve"},
    ("empreintes", "status"): {
        "ok": "ok",
        "no_preview": "sans_extrait",
        "audio_failed": "audio_rate",
        "gone": "disparu",
    },
    ("mesures", "status"): {"ok": "ok", "audio_failed": "audio_rate"},
    ("bulletins", "type"): KIND,
    ("votes", "type"): KIND,
}
DROPPED = {("votes", "source")}

FEATURES = ", ".join(["0.5"] * 9)

ROWS = f"""
INSERT INTO artists VALUES (1, 'A'), (2, 'B');
INSERT INTO tracks VALUES
    (10, 1, 't10', 'library', 'k10', 'd'), (11, 1, 't11', 'candidate', 'k11', 'd'),
    (12, 2, 't12', 'negative', 'k12', 'd'), (13, 2, 't13', 'favorite', 'k13', 'd'),
    (14, 1, 't14', 'candidate', 'k14', 'd'), (15, 1, 't15', 'candidate', 'k15', 'd');
INSERT INTO library_tracks VALUES
    ('p1', 'A', 'x', 'al', 1000, 3, 'd', '/f'), ('p2', 'B', 'y', 'al', NULL, 0, 'd', NULL);
INSERT INTO deezer_matches VALUES
    ('p1', 'matched', NULL, 10, 1, 'd'), ('p2', 'unmatched', 'no_result', NULL, NULL, 'd');
INSERT INTO discover_runs VALUES (1, 's', 'f', 'done'), (2, 's', NULL, 'running');
INSERT INTO run_seeds VALUES (1, 1);
INSERT INTO candidates VALUES
    (11, 1, 'voisin', 1, 2, NULL), (14, 2, 'hypem', NULL, NULL, 'x'),
    (15, 2, 'deezer_editorial', NULL, NULL, 'y');
INSERT INTO negative_artists VALUES (2, 'metal');
INSERT INTO track_measures VALUES
    (10, 'ok', zeroblob(5120), 'm', 'd'), (11, 'no_preview', NULL, 'm', 'd'),
    (12, 'audio_failed', NULL, 'm', 'd'), (13, 'gone', NULL, 'm', 'd');
INSERT INTO models VALUES (1, 'd', 'f', 1, 'v', '{{}}', '{{"votes_digest": "x"}}');
INSERT INTO scores VALUES (11, 1, 0.5, 1, 0), (14, 1, 0.2, 0, 1);
INSERT INTO selections VALUES (1, 'd', 1);
INSERT INTO ballots VALUES (11, 1, 'exam', 0, 1), (14, 1, 'lesson', 1, 0);
INSERT INTO votes VALUES (11, 'exam', 'oui', 'd', 'page'), (14, 'lesson', 'non', 'd', 'page');
INSERT INTO acquisitions VALUES
    (11, 'ready', NULL, 1, '/a', 'd'), (14, 'failed', 'aucun résultat', 2, NULL, 'd'),
    (15, 'published', NULL, 1, NULL, 'd');
INSERT INTO repere_sorties VALUES (10, 'd');
INSERT INTO antenne VALUES
    (11, 'decouverte', 'decouvertes', 1, 's1', '/a1', 'd', 'd'),
    (10, 'repere', 'reperes', 2, 's2', '/a2', 'd', 'd');
INSERT INTO track_features VALUES
    (11, 'ok', 'm', 'd', 200, {FEATURES}, 120, 121, 119),
    (10, 'audio_failed', 'm', 'd', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
     NULL, NULL, NULL);
INSERT INTO stage_reports VALUES (1, 'i', 'gout', 'd', 1, '{{"n": 1}}');
INSERT INTO grille VALUES (1.0, 's1');
"""


def _at_17(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    before = tmp_path / "migrations"
    before.mkdir()
    for script in sorted(MIGRATIONS.glob("*.sql"))[:17]:
        shutil.copy(script, before)
    monkeypatch.setattr("radio.socle.db.MIGRATIONS", before)
    db = tmp_path / "radio.db"
    connect(db).close()
    return db


def _rows(conn: sqlite3.Connection, table: str) -> list[dict[str, object]]:
    cur = conn.execute(f'SELECT * FROM "{table}"')
    names = [d[0] for d in cur.description]
    return [dict(zip(names, r, strict=True)) for r in cur]


def _key(row: dict[str, object]) -> list[tuple[str, str]]:
    return sorted((k, repr(v)) for k, v in row.items())


def _expected(old: str, row: dict[str, object]) -> dict[str, object]:
    new = TABLES[old]
    out: dict[str, object] = {}
    for col, value in row.items():
        if (new, col) in DROPPED:
            continue
        name = COLUMNS.get(col, col)
        mapping = VALUES.get((new, name))
        out[name] = mapping[value] if mapping is not None else value  # type: ignore[index]
    return out


def test_018_gives_every_row_its_new_names(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    # Breaks if 018 forgets a table, a column or a value, maps a value wrong, loses a row, or
    # keeps votes.source.
    db = _at_17(tmp_path, monkeypatch)
    raw = sqlite3.connect(db)
    raw.execute("PRAGMA foreign_keys = ON")
    raw.executescript(ROWS)
    before = {old: _rows(raw, old) for old in TABLES}
    raw.close()
    assert all(before.values()), [t for t, rows in before.items() if not rows]

    monkeypatch.setattr("radio.socle.db.MIGRATIONS", MIGRATIONS)
    connect(db).close()

    after = sqlite3.connect(db)
    names = {r[0] for r in after.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}
    assert names == set(TABLES.values())
    for old, rows in before.items():
        got = sorted(_key(r) for r in _rows(after, TABLES[old]))
        assert got == sorted(_key(_expected(old, r)) for r in rows), old
    indexes = {
        r[0]
        for r in after.execute(
            "SELECT name FROM sqlite_master WHERE type = 'index' AND sql IS NOT NULL"
        )
    }
    assert indexes == {"fournee_en_cours", "titres_dedoublonnage"}
    assert after.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
    assert after.execute("PRAGMA foreign_key_check").fetchall() == []
    after.close()


def test_018_refuses_a_value_it_does_not_know(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    # Breaks if 018 lets a value outside the vocabulary through (as NULL or unchanged) instead of
    # failing and leaving the base at 17.
    db = _at_17(tmp_path, monkeypatch)
    raw = sqlite3.connect(db)
    raw.execute("PRAGMA ignore_check_constraints = ON")
    raw.execute("INSERT INTO artists VALUES (1, 'A')")
    raw.execute("INSERT INTO tracks VALUES (10, 1, 't', 'inconnue', 'k', 'd')")
    raw.commit()
    raw.close()

    monkeypatch.setattr("radio.socle.db.MIGRATIONS", MIGRATIONS)
    with pytest.raises(sqlite3.IntegrityError):
        connect(db)

    check = sqlite3.connect(db)
    assert check.execute("PRAGMA user_version").fetchone()[0] == 17
    assert check.execute("SELECT origin FROM tracks").fetchall() == [("inconnue",)]
    check.close()
