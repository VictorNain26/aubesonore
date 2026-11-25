from datetime import UTC, datetime
from pathlib import Path

import numpy as np

from radio.gout.modele import Fournee, entrainer
from radio.socle.config import GoutConfig
from radio.votes.etat import charger_etat
from radio.votes.tirage import tirer_bulletins
from tests.model_factory import NO_FLOOR, NOW, add_vote, make_model_db, serve_scores

LATER = datetime(2026, 9, 26, tzinfo=UTC)


def test_status_measures_the_serving_model_and_the_page_yes_rate(tmp_path: Path) -> None:
    conn = make_model_db(tmp_path)
    add_vote(conn, 200600, "examen", "oui")
    add_vote(conn, 300600, "examen", "non", at="2026-09-25T09:00:00+00:00")
    add_vote(conn, 300700, "lecon", "non", at="2026-09-01T09:00:00+00:00")  # hors 7 jours
    conn.execute("INSERT INTO fournees VALUES (1, 'd', 'd', 'done')")
    conn.execute("INSERT INTO modeles VALUES (9, 'd', 'f', 0, 'v', '{\"votes\": 0}', '{}')")
    conn.execute("INSERT INTO tirages VALUES (1, ?, 9)", (NOW,))
    conn.execute(
        "INSERT INTO bulletins VALUES (200700, 1, 'examen', 0, 1), (300800, 1, 'examen', 1, 0)"
    )
    conn.execute("INSERT INTO votes VALUES (200700, 'examen', 'non', '2026-09-24T12:00:00')")
    conn.execute("INSERT INTO votes VALUES (300800, 'examen', 'non', '2026-09-24T12:00:00')")
    conn.commit()
    report = entrainer(conn, tmp_path / "models", GoutConfig(), NOW)

    st = charger_etat(conn, tmp_path / "models", 60, 7, LATER)
    assert st.modele_id == report.modele_id
    assert st.exam_auc is not None and st.n_exam == 4
    assert st.yes is not None and (st.yes.n, st.yes.yes) == (1, 0)
    assert st.last_exam_vote == "2026-09-25T09:00:00+00:00"
    assert st.recent_votes == 4
    assert st.pending == 0 and st.batch is None


def test_status_without_a_model_still_counts_ballots(tmp_path: Path) -> None:
    conn = make_model_db(tmp_path)
    assert charger_etat(conn, tmp_path / "models", 60, 7, LATER).modele_id is None
    serve_scores(conn)  # modèle n°1 promu, sans fichier : on ne mesure que la file ici
    tirer_bulletins(conn, np.random.default_rng(0), 10, 10, NOW, floor=NO_FLOOR)
    conn.execute("UPDATE modeles SET promoted = 0")
    conn.commit()
    st = charger_etat(conn, tmp_path / "models", 60, 7, LATER)
    assert st.modele_id is None and st.exam_auc is None
    assert st.pending == 20
    assert st.last_selection == NOW
    assert st.batch == Fournee(2, 48, 24, 0)
    assert st.stale_selection_days == 1
