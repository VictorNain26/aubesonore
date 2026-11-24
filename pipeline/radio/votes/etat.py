"""État du goût, pour le rapport.

Le taux de oui des retenus se mesure sur les votes d'examen de la page dont le titre était retenu
au tirage. L'AUC du modèle en service se mesure sur toute la fenêtre d'examen.
"""

import sqlite3
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path

import numpy as np

from radio.empreintes.table import charger_empreintes
from radio.gout.exemples import build_labels
from radio.gout.modele import Fournee, TauxOui, auc, derniere_fournee, en_service, predict, taux_oui
from radio.votes.tirage import bulletins_en_attente


@dataclass(frozen=True)
class Etat:
    model_id: int | None
    exam_auc: float | None
    n_exam: int
    yes: TauxOui | None
    last_exam_vote: str | None
    pending: int
    last_selection: str | None
    stale_selection_days: int | None
    recent_votes: int
    batch: Fournee | None


def charger_etat(
    conn: sqlite3.Connection,
    models_dir: Path,
    fenetre_examen: int,
    jours_silence: int,
    now: datetime,
) -> Etat:
    current = en_service(conn, models_dir)
    exam_auc, n_exam = None, 0
    if current is not None:
        table = charger_empreintes(conn)
        exam = build_labels(conn, table, fenetre_examen).exam
        exam_auc, n_exam = auc(exam.labels, predict(current[1], table, exam.rows)), len(exam.rows)
    page = conn.execute(
        """
        SELECT v.vote = 'oui' FROM votes v JOIN bulletins b USING (titre_id)
        WHERE v.type = 'examen' AND b.retenu = 1 AND v.vote != 'passer'
        ORDER BY v.voted_at DESC LIMIT ?
        """,
        (fenetre_examen,),
    ).fetchall()
    last_exam = conn.execute(
        "SELECT MAX(voted_at) FROM votes WHERE type = 'examen' AND vote != 'passer'"
    ).fetchone()[0]
    since = (now - timedelta(days=jours_silence)).isoformat()
    recent = conn.execute(
        "SELECT COUNT(*) FROM votes WHERE voted_at >= ? AND vote != 'passer'", (since,)
    ).fetchone()[0]
    last_selection = conn.execute("SELECT MAX(selected_at) FROM tirages").fetchone()[0]
    return Etat(
        model_id=None if current is None else current[0],
        exam_auc=exam_auc,
        n_exam=n_exam,
        yes=taux_oui(np.array([int(r[0]) for r in page], dtype=np.int64)),
        last_exam_vote=last_exam,
        pending=len(bulletins_en_attente(conn)),
        last_selection=last_selection,
        stale_selection_days=None
        if last_selection is None
        else (now - datetime.fromisoformat(last_selection)).days,
        recent_votes=int(recent),
        batch=derniere_fournee(conn),
    )
