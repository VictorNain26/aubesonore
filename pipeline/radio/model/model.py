"""Modèle de goût : régression logistique sur l'empreinte audio (décision du 2026-09-30,
docs/recherches/2026-09-30-modele-audio-seul.md).

Chaque fournée de candidats est classée famille par famille (découvertes, nouveautés) ; les
mieux notés de chaque famille sont retenus, en nombre fixé par la grille d'antenne
(docs/recherches/2026-10-02-cycle-de-vie.md), et jamais sous le plancher de score de leur famille
(décision du 2026-10-19 pour les nouveautés : `min_score_nouveautes`).
Seuls les votes d'examen jugent : un nouveau modèle n'est mis en service que si son AUC d'examen
n'est pas inférieure à celle du modèle en service.
"""

import json
import sqlite3
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path

import joblib
import numpy as np
import numpy.typing as npt
import sklearn
from scipy.stats import binomtest
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score
from sklearn.pipeline import Pipeline, make_pipeline
from sklearn.preprocessing import StandardScaler

from radio.core.config import ModelConfig
from radio.core.family import FAMILY
from radio.model.dataset import Dataset, build_labels, weights
from radio.signals.audio import MODEL_TAG
from radio.signals.table import SignalTable, load_signals

Floats = npt.NDArray[np.float64]
Ints = npt.NDArray[np.int64]


@dataclass(frozen=True)
class YesRate:
    n: int
    yes: int
    low: float
    high: float

    @property
    def rate(self) -> float:
        return self.yes / self.n


def yes_rate(labels: Ints) -> YesRate | None:
    """Taux de oui, intervalle de Wilson à 95 %."""
    n, yes = len(labels), int(labels.sum())
    if n == 0:
        return None
    ci = binomtest(yes, n).proportion_ci(confidence_level=0.95, method="wilson")
    return YesRate(n, yes, float(ci.low), float(ci.high))


def auc(labels: Ints, scores: Floats) -> float | None:
    if len(np.unique(labels)) < 2:
        return None
    return float(roc_auc_score(labels, scores))


def fit(table: SignalTable, ds: Dataset, cfg: ModelConfig) -> Pipeline:
    model = make_pipeline(StandardScaler(), LogisticRegression(C=cfg.c, max_iter=3000))
    return model.fit(
        table.audio[ds.rows],
        ds.labels,
        logisticregression__sample_weight=weights(ds, cfg.weak_weight),
    )


def predict(model: Pipeline, table: SignalTable, rows: Ints) -> Floats:
    if len(rows) == 0:
        return np.zeros(0)
    return np.asarray(model.predict_proba(table.audio[rows])[:, 1], dtype=np.float64)


def _serving_row(conn: sqlite3.Connection) -> sqlite3.Row | None:
    row: sqlite3.Row | None = conn.execute(
        "SELECT model_id, file FROM models WHERE promoted = 1 ORDER BY model_id DESC LIMIT 1"
    ).fetchone()
    return row


def serving_id(conn: sqlite3.Connection) -> int | None:
    row = _serving_row(conn)
    return None if row is None else int(row["model_id"])


def serving(conn: sqlite3.Connection, models_dir: Path) -> tuple[int, Pipeline] | None:
    row = _serving_row(conn)
    if row is None:
        return None
    return int(row["model_id"]), joblib.load(models_dir / row["file"])


@dataclass(frozen=True)
class Batch:
    run_id: int
    n: int
    retained: int
    floored: int


def write_scores(
    conn: sqlite3.Connection,
    model_id: int,
    model: Pipeline,
    table: SignalTable,
    keep: Mapping[str, int],
    floor: Mapping[str, float],
) -> None:
    """Note les candidats de chaque passe de découverte et retient, passe par passe et famille
    par famille, les `keep[famille]` mieux notés : découvertes et nouveautés ne se disputent pas
    la même coupure. Un titre noté sous `floor[famille]` n'est jamais retenu, même quota restant :
    il ne réserve pas son artiste, et le premier de chaque artiste ainsi écarté alors que le quota
    restait est marqué `floored`, pour le rapport. Un artiste n'entre qu'un titre par fournée,
    toutes familles confondues : son mieux noté (Release Radar,
    docs/recherches/2026-10-02-programmation.md §1). Un candidat entré depuis dans la
    bibliothèque n'est plus une découverte."""
    group_of = {
        int(t): (int(run), FAMILY[str(source)])
        for t, run, source in conn.execute("SELECT deezer_track_id, run_id, source FROM candidates")
    }
    artist_of = {
        int(t): int(a)
        for t, a in conn.execute(
            "SELECT deezer_track_id, deezer_artist_id FROM tracks JOIN candidates "
            "USING (deezer_track_id)"
        )
    }
    rows = np.array(
        [
            i
            for i, (t, origin) in enumerate(
                zip(table.track_ids.tolist(), table.origins, strict=True)
            )
            if t in group_of and origin == "candidate"
        ],
        dtype=np.int64,
    )
    scores = predict(model, table, rows)
    groups = [group_of[int(table.track_ids[i])] for i in rows]
    accepted = np.zeros(len(rows), dtype=bool)
    floored = np.zeros(len(rows), dtype=bool)
    for run in {g[0] for g in groups}:
        idx = np.flatnonzero([g[0] == run for g in groups])
        left = dict(keep)
        taken: set[int] = set()
        below: set[int] = set()
        marked = dict.fromkeys(left, 0)
        for i in idx[np.argsort(-scores[idx], kind="stable")]:
            family, artist = groups[i][1], artist_of[int(table.track_ids[rows[i]])]
            if left[family] == 0 or artist in taken:
                continue
            if scores[i] < floor[family]:
                # Compté une fois par artiste, et tant qu'une place restait : ce que la fournée
                # aurait retenu sans plancher.
                if artist not in below and marked[family] < left[family]:
                    floored[i] = True
                    marked[family] += 1
                below.add(artist)
                continue
            accepted[i] = True
            left[family] -= 1
            taken.add(artist)
    with conn:
        conn.execute("DELETE FROM scores")
        conn.executemany(
            "INSERT INTO scores VALUES (?, ?, ?, ?, ?)",
            [
                (int(table.track_ids[i]), model_id, float(s), int(a), int(f))
                for i, s, a, f in zip(rows, scores, accepted, floored, strict=True)
            ],
        )


def last_batch(conn: sqlite3.Connection) -> Batch | None:
    row = conn.execute(
        """
        SELECT c.run_id, COUNT(*), SUM(s.accepted), SUM(s.floored)
        FROM scores s JOIN candidates c USING (deezer_track_id)
        GROUP BY c.run_id ORDER BY c.run_id DESC LIMIT 1
        """
    ).fetchone()
    return None if row is None else Batch(int(row[0]), int(row[1]), int(row[2]), int(row[3]))


def votes_count(conn: sqlite3.Connection) -> int:
    return int(conn.execute("SELECT COUNT(*) FROM votes WHERE vote != 'passer'").fetchone()[0])


def trained_on(conn: sqlite3.Connection) -> int | None:
    """Nombre de votes vus par le dernier entraînement."""
    row = conn.execute("SELECT params FROM models ORDER BY model_id DESC LIMIT 1").fetchone()
    return None if row is None else int(json.loads(row[0])["votes"])


@dataclass(frozen=True)
class TrainReport:
    model_id: int
    promoted: bool
    verdict: str
    counts: dict[str, int]
    n_weak_excluded: int
    n_votes_unmeasured: int
    n_exam: int
    new_auc: float | None
    current_auc: float | None


def _decide(
    current: tuple[int, Pipeline] | None, new: float | None, cur: float | None
) -> str | None:
    """Raison du refus, ou None si le nouveau modèle est mis en service."""
    if current is None:
        return None
    if new is None or cur is None:
        return "comparaison impossible : l'examen n'a pas à la fois des « oui » et des « non »"
    if new < cur:
        return f"AUC d'examen {new:.3f} < {cur:.3f} (modèle en service)".replace(".", ",")
    return None


def train(conn: sqlite3.Connection, models_dir: Path, cfg: ModelConfig, now: str) -> TrainReport:
    table = load_signals(conn)
    labels = build_labels(conn, table, cfg.exam_window)
    model = fit(table, labels.train, cfg)
    exam = labels.exam
    new_auc = auc(exam.labels, predict(model, table, exam.rows))
    current = serving(conn, models_dir)
    cur_auc = None if current is None else auc(exam.labels, predict(current[1], table, exam.rows))
    refusal = _decide(current, new_auc, cur_auc)
    verdict = refusal or ("premier modèle" if current is None else "AUC d'examen au moins égale")
    params = {
        "c": cfg.c,
        "weak_weight": cfg.weak_weight,
        "embedding": MODEL_TAG,
        "sklearn": sklearn.__version__,
        "votes": labels.n_votes,
    }
    metrics = {
        "counts": labels.train.counts(),
        "exam": {"n": len(exam.rows), "auc": new_auc, "current_auc": cur_auc},
    }
    models_dir.mkdir(parents=True, exist_ok=True)
    with conn:
        model_id = conn.execute(
            "INSERT INTO models (trained_at, file, promoted, verdict, params, metrics) "
            "VALUES (?, '', ?, ?, ?, ?)",
            (now, int(refusal is None), verdict, json.dumps(params), json.dumps(metrics)),
        ).lastrowid
        assert model_id is not None
        file = f"modele-{model_id:04d}.joblib"
        # Dans la transaction : si l'écriture du fichier échoue, la ligne n'existe pas.
        joblib.dump(model, models_dir / file)
        conn.execute("UPDATE models SET file = ? WHERE model_id = ?", (file, model_id))
    return TrainReport(
        model_id=model_id,
        promoted=refusal is None,
        verdict=verdict,
        counts=labels.train.counts(),
        n_weak_excluded=labels.n_weak_excluded,
        n_votes_unmeasured=labels.n_votes_unmeasured,
        n_exam=len(exam.rows),
        new_auc=new_auc,
        current_auc=cur_auc,
    )


def rescore(conn: sqlite3.Connection, models_dir: Path, cfg: ModelConfig) -> int | None:
    """Note les candidats avec le modèle en service ; renvoie son numéro, None s'il n'y en a pas."""
    current = serving(conn, models_dir)
    if current is None:
        return None
    model_id, model = current
    write_scores(conn, model_id, model, load_signals(conn), cfg.keep, cfg.floor)
    return model_id


@dataclass(frozen=True)
class FavoritesRetained:
    share: float
    n: int
    chance: float


def favorites_retained(conn: sqlite3.Connection, models_dir: Path) -> FavoritesRetained | None:
    """Part des favoris Hype Machine mesurés que le modèle en service retiendrait, à la coupure
    des découvertes de la dernière fournée ; le hasard en retiendrait `chance`, la part de ces
    découvertes notées à la coupure ou au-dessus (et non la part retenue : la règle d'un titre
    par artiste en écarte qui sont au-dessus). Une mesure de goût sur des centaines de titres que
    Victor aime ; elle ne décide jamais d'une promotion."""
    current = serving(conn, models_dir)
    row = conn.execute(
        """
        WITH latest AS (
            SELECT s.score, s.accepted FROM scores s JOIN candidates c USING (deezer_track_id)
            WHERE c.source = 'voisin' AND c.run_id = (SELECT MAX(run_id) FROM candidates)
        ), cut AS (SELECT MIN(score) AS score FROM latest WHERE accepted = 1)
        SELECT cut.score, AVG(latest.score >= cut.score) FROM latest, cut
        """
    ).fetchone()
    table = load_signals(conn)
    rows = np.array([i for i, o in enumerate(table.origins) if o == "favorite"], dtype=np.int64)
    if current is None or row[0] is None or len(rows) == 0:
        return None
    scores = predict(current[1], table, rows)
    return FavoritesRetained(float((scores >= float(row[0])).mean()), len(rows), float(row[1]))
