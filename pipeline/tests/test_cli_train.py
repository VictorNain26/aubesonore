import json
from pathlib import Path

import pytest
from typer.testing import CliRunner

import radio.commandes as commandes
from radio.socle.config import Settings
from radio.socle.db import connect
from radio.votes.tirage import enregistrer_vote
from tests.model_factory import NOW, add_vote, as_news, make_model_db, seed_run

runner = CliRunner()


@pytest.fixture
def env(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    cfg = tmp_path / "config"
    cfg.mkdir()
    (cfg / "editorial.toml").write_text("[gout]\nretenus_decouvertes = 32\n")
    settings = Settings(_env_file=None, RADIO_DATA_DIR=tmp_path / "data", RADIO_CONFIG_DIR=cfg)
    monkeypatch.setattr(commandes.commun, "_settings", lambda: settings)
    return tmp_path


def test_train_promotes_scores_then_skips_without_new_votes(env: Path) -> None:
    conn = make_model_db(env / "data")
    seed_run(conn)
    add_vote(conn, 200600, "examen", "oui")
    add_vote(conn, 300600, "examen", "non")
    conn.close()

    res = runner.invoke(commandes.app, ["gout"])
    assert res.exit_code == 0, res.output
    assert "Examen : 2 votes, AUC 1,000" in res.output
    assert "Modèle n°1 : promu — premier modèle" in res.output
    # 24 artistes de 4 titres : un retenu par artiste.
    assert "Dernière fournée (passe n°1) : 24 retenus sur 96 candidats" in res.output

    conn = connect(env / "data" / "radio.db")
    kept = conn.execute("SELECT titre_id < 300000, SUM(retenu) FROM notes GROUP BY 1").fetchall()
    conn.close()
    # La coupure (80) dépasse les 24 artistes : chacun entre son titre le mieux noté, un seul.
    assert sorted(tuple(r) for r in kept) == [(0, 12), (1, 12)]

    res = runner.invoke(commandes.app, ["gout"])
    assert res.exit_code == 0, res.output
    assert "Aucun vote nouveau ni corrigé (2 votes) : pas de réentraînement" in res.output
    assert "Candidats notés par le modèle n°1" in res.output


def test_train_learns_a_corrected_vote(env: Path) -> None:
    # Breaks if entrainer decides on the number of votes alone: a vote corrected on /semaine, while
    # its selection is still the latest, keeps that number.
    conn = make_model_db(env / "data")
    seed_run(conn)
    add_vote(conn, 200600, "examen", "oui")
    add_vote(conn, 300600, "examen", "non")
    conn.close()
    assert runner.invoke(commandes.app, ["gout"]).exit_code == 0

    conn = connect(env / "data" / "radio.db")
    with conn:
        conn.execute("INSERT INTO tirages (selected_at, modele_id) VALUES (?, 1)", (NOW,))
        conn.execute("INSERT INTO bulletins VALUES (200100, 1, 'lecon', 0, 1)")
    assert enregistrer_vote(conn, 200100, "oui", NOW)
    conn.close()
    res = runner.invoke(commandes.app, ["gout"])
    assert "Exemples : bibliothèque 48, oui 1, non 0" in res.output, res.output

    conn = connect(env / "data" / "radio.db")
    assert enregistrer_vote(conn, 200100, "non", NOW)
    conn.close()
    res = runner.invoke(commandes.app, ["gout"])
    assert res.exit_code == 0, res.output
    assert "Exemples : bibliothèque 48, oui 0, non 1" in res.output, res.output


def test_train_reports_the_news_kept_off_air_by_the_floor(env: Path) -> None:
    (env / "config" / "editorial.toml").write_text("[gout]\nplancher_nouveautes = 0.5\n")
    conn = make_model_db(env / "data")
    seed_run(conn)
    # Les 12 artistes rejetés (3000 à 3011) deviennent des nouveautés : toutes sous le plancher.
    as_news(conn, 300000)
    conn.close()

    res = runner.invoke(commandes.app, ["gout"])
    assert res.exit_code == 0, res.output
    assert (
        "Dernière fournée (passe n°1) : 12 retenus sur 96 candidats, "
        "12 nouveautés écartées sous le plancher de score"
    ) in res.output
    conn = connect(env / "data" / "radio.db")
    counts = json.loads(
        conn.execute("SELECT counts FROM rapports WHERE stage = 'gout'").fetchone()[0]
    )
    conn.close()
    assert counts["retenus"] == 12 and counts["nouveautés sous le plancher"] == 12


def test_first_training_without_exam_votes_is_promoted(env: Path) -> None:
    make_model_db(env / "data").close()
    res = runner.invoke(commandes.app, ["gout"])
    assert res.exit_code == 0, res.output
    assert "Examen : 0 votes, AUC —" in res.output
    assert "Modèle n°1 : promu — premier modèle" in res.output


def test_train_without_negatives_exits_1(env: Path) -> None:
    conn = make_model_db(env / "data", n_artists=4, per_artist=2)
    conn.execute("DELETE FROM empreintes WHERE titre_id >= 300000")
    conn.commit()
    conn.close()
    res = runner.invoke(commandes.app, ["gout"])
    assert res.exit_code == 1
    assert "Exemples insuffisants" in res.output
