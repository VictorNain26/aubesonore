"""Test de bout en bout de la couture modèle <-> votes : entraînement réel, sélection,
vote sur la vraie page, réentraînement, deuxième sélection. `radio decouverte` est hors de portée
d'un test sans réseau : la file de candidats est semée directement (mêmes tables que
`radio decouverte` remplirait).
"""

from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from typer.testing import CliRunner

import radio.commandes as commandes
from radio.socle.config import Settings
from radio.socle.db import connect
from radio.votes.page import create_app
from radio.votes.tirage import bulletins_en_attente
from tests.factories import OK, PreviewDeezer, verify
from tests.model_factory import add_vote, make_model_db, seed_run

runner = CliRunner()


@pytest.fixture
def env(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    cfg = tmp_path / "config"
    cfg.mkdir()
    (cfg / "editorial.toml").write_text("")
    settings = Settings(_env_file=None, RADIO_DATA_DIR=tmp_path / "data", RADIO_CONFIG_DIR=cfg)
    monkeypatch.setattr(commandes.commun, "_settings", lambda: settings)
    return tmp_path


def test_votes_lifecycle_from_training_to_a_second_selection(env: Path) -> None:
    conn = make_model_db(env / "data")
    seed_run(conn)
    for a in range(5):
        add_vote(conn, (2000 + a) * 100, "lesson", "oui")
        add_vote(conn, (3000 + a) * 100, "lesson", "non")
    conn.close()
    db_path = env / "data" / "radio.db"

    # 1. `radio gout` : modèle n°1 promu, candidats notés.
    res = runner.invoke(commandes.app, ["gout"])
    assert res.exit_code == 0, res.output
    assert "Modèle n°1 : promu — premier modèle" in res.output

    # 2. `radio tirage` : des bulletins en attente.
    res = runner.invoke(commandes.app, ["tirage"])
    assert res.exit_code == 0, res.output
    conn = connect(db_path)
    first_pending = bulletins_en_attente(conn)
    conn.close()
    assert first_pending, "aucun bulletin tiré : la base du factory n'a pas assez de candidats"

    # 3. vote sur la vraie page pour chaque bulletin en attente, « oui »/« non » en alternance.
    client = TestClient(create_app(db_path, PreviewDeezer(), verify))
    for i, bulletin in enumerate(first_pending):
        choix = "oui" if i % 2 == 0 else "non"
        r = client.post(
            "/vote",
            data={"tid": str(bulletin.deezer_track_id), "choix": choix},
            headers=OK,
            follow_redirects=False,
        )
        assert r.status_code == 303

    # 4. `radio gout` : les nouveaux votes déclenchent un réentraînement, deux modèles en base.
    res = runner.invoke(commandes.app, ["gout"])
    assert res.exit_code == 0, res.output
    assert "Aucun vote nouveau ni corrigé" not in res.output
    conn = connect(db_path)
    n_models = conn.execute("SELECT COUNT(*) FROM models").fetchone()[0]
    conn.close()
    assert n_models == 2

    # 5. `radio tirage` : une nouvelle sélection (2 lignes dans `selections`).
    res = runner.invoke(commandes.app, ["tirage"])
    assert res.exit_code == 0, res.output
    conn = connect(db_path)
    n_selections = conn.execute("SELECT COUNT(*) FROM selections").fetchone()[0]
    conn.close()
    assert n_selections == 2, (
        "pas assez de candidats restants dans la base du factory pour une deuxième sélection "
        "réelle : augmenter n_artists/per_artist de make_model_db si ce test doit couvrir ce cas"
    )
