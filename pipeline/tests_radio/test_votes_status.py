from datetime import UTC, datetime
from pathlib import Path

import numpy as np

from radio.core.config import ModelConfig
from radio.model.model import Batch, train
from radio.votes.select import select_batch
from radio.votes.status import load_status
from tests_radio.model_factory import NO_FLOOR, NOW, add_vote, make_model_db, serve_scores

LATER = datetime(2026, 9, 26, tzinfo=UTC)


def test_status_measures_the_serving_model_and_the_page_yes_rate(tmp_path: Path) -> None:
    conn = make_model_db(tmp_path)
    add_vote(conn, 200600, "exam", "oui")
    add_vote(conn, 300600, "exam", "non", at="2026-09-25T09:00:00+00:00")
    add_vote(conn, 300700, "lesson", "non", at="2026-09-01T09:00:00+00:00")  # hors 7 jours
    conn.execute("INSERT INTO discover_runs VALUES (1, 'd', 'd', 'done')")
    conn.execute("INSERT INTO models VALUES (9, 'd', 'f', 0, 'v', '{\"votes\": 0}', '{}')")
    conn.execute("INSERT INTO selections VALUES (1, ?, 9)", (NOW,))
    conn.execute("INSERT INTO ballots VALUES (200700, 1, 'exam', 0, 1), (300800, 1, 'exam', 1, 0)")
    conn.execute("INSERT INTO votes VALUES (200700, 'exam', 'non', '2026-09-24T12:00:00', 'page')")
    conn.execute("INSERT INTO votes VALUES (300800, 'exam', 'non', '2026-09-24T12:00:00', 'page')")
    conn.commit()
    report = train(conn, tmp_path / "models", ModelConfig(), NOW)

    st = load_status(conn, tmp_path / "models", 60, 7, LATER)
    assert st.model_id == report.model_id
    assert st.exam_auc is not None and st.n_exam == 4
    assert st.yes is not None and (st.yes.n, st.yes.yes) == (1, 0)
    assert st.last_exam_vote == "2026-09-25T09:00:00+00:00"
    assert st.recent_votes == 4
    assert st.pending == 0 and st.batch is None


def test_status_without_a_model_still_counts_ballots(tmp_path: Path) -> None:
    conn = make_model_db(tmp_path)
    assert load_status(conn, tmp_path / "models", 60, 7, LATER).model_id is None
    serve_scores(conn)  # modèle n°1 promu, sans fichier : on ne mesure que la file ici
    select_batch(conn, np.random.default_rng(0), 10, 10, NOW, floor=NO_FLOOR)
    conn.execute("UPDATE models SET promoted = 0")
    conn.commit()
    st = load_status(conn, tmp_path / "models", 60, 7, LATER)
    assert st.model_id is None and st.exam_auc is None
    assert st.pending == 20
    assert st.last_selection == NOW
    assert st.batch == Batch(2, 48, 24, 0)
    assert st.stale_selection_days == 1
