import json
from pathlib import Path

import pytest
from typer.testing import CliRunner

import radio.cli as cli
from radio.core.config import Settings
from radio.core.db import connect
from tests_radio.model_factory import add_vote, make_model_db, seed_run

runner = CliRunner()


@pytest.fixture
def env(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    cfg = tmp_path / "config"
    cfg.mkdir()
    (cfg / "editorial.toml").write_text("[model]\nkeep_decouvertes = 32\n")
    settings = Settings(_env_file=None, RADIO_DATA_DIR=tmp_path / "data", RADIO_CONFIG_DIR=cfg)
    monkeypatch.setattr(cli.common, "_settings", lambda: settings)
    return tmp_path


def test_train_promotes_scores_then_skips_without_new_votes(env: Path) -> None:
    conn = make_model_db(env / "data")
    seed_run(conn)
    add_vote(conn, 200600, "exam", "oui")
    add_vote(conn, 300600, "exam", "non")
    conn.close()

    res = runner.invoke(cli.app, ["train"])
    assert res.exit_code == 0, res.output
    assert "Examen : 2 votes, AUC 1,000" in res.output
    assert "Modèle n°1 : promu — premier modèle" in res.output
    # 24 artistes de 4 titres : un retenu par artiste.
    assert "Dernière fournée (passe n°1) : 24 retenus sur 96 candidats" in res.output

    conn = connect(env / "data" / "radio.db")
    kept = conn.execute(
        "SELECT deezer_track_id < 300000, SUM(accepted) FROM scores GROUP BY 1"
    ).fetchall()
    conn.close()
    # La coupure (80) dépasse les 24 artistes : chacun entre son titre le mieux noté, un seul.
    assert sorted(tuple(r) for r in kept) == [(0, 12), (1, 12)]

    res = runner.invoke(cli.app, ["train"])
    assert res.exit_code == 0, res.output
    assert "Aucun nouveau vote (2 votes) : pas de réentraînement" in res.output
    assert "Candidats notés par le modèle n°1" in res.output


def test_train_reports_the_news_kept_off_air_by_the_floor(env: Path) -> None:
    (env / "config" / "editorial.toml").write_text("[model]\nmin_score_nouveautes = 0.5\n")
    conn = make_model_db(env / "data")
    seed_run(conn)
    # Les 12 artistes rejetés (3000 à 3011) deviennent des nouveautés : toutes sous le plancher.
    conn.execute(
        "UPDATE candidates SET source = 'hypem', seed_artist_id = NULL, "
        "neighbour_artist_id = NULL, detail = 'Blog' WHERE deezer_track_id >= 300000"
    )
    conn.commit()
    conn.close()

    res = runner.invoke(cli.app, ["train"])
    assert res.exit_code == 0, res.output
    assert (
        "Dernière fournée (passe n°1) : 12 retenus sur 96 candidats, "
        "12 nouveautés écartées sous le plancher de score"
    ) in res.output
    conn = connect(env / "data" / "radio.db")
    counts = json.loads(
        conn.execute("SELECT counts FROM stage_reports WHERE stage = 'train'").fetchone()[0]
    )
    conn.close()
    assert counts["retenus"] == 12 and counts["nouveautés sous le plancher"] == 12


def test_first_training_without_exam_votes_is_promoted(env: Path) -> None:
    make_model_db(env / "data").close()
    res = runner.invoke(cli.app, ["train"])
    assert res.exit_code == 0, res.output
    assert "Examen : 0 votes, AUC —" in res.output
    assert "Modèle n°1 : promu — premier modèle" in res.output


def test_train_without_negatives_exits_1(env: Path) -> None:
    conn = make_model_db(env / "data", n_artists=4, per_artist=2)
    conn.execute("DELETE FROM track_measures WHERE deezer_track_id >= 300000")
    conn.commit()
    conn.close()
    res = runner.invoke(cli.app, ["train"])
    assert res.exit_code == 1
    assert "Exemples insuffisants" in res.output
