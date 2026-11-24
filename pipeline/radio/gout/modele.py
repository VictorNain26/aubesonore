"""Modèle de goût : régression logistique sur l'empreinte audio (décision du 2026-09-30,
docs/recherches/2026-09-30-modele-audio-seul.md).

Chaque fournée de candidats est classée famille par famille (découvertes, nouveautés) ; les
mieux notés de chaque famille sont retenus, en nombre fixé par la grille d'antenne
(docs/recherches/2026-10-02-cycle-de-vie.md), et jamais sous le plancher de score de leur famille
(décision du 2026-10-19 pour les nouveautés : `plancher_nouveautes`).
Seuls les votes d'examen jugent : un nouveau modèle n'est mis en service que si son AUC d'examen
n'est pas inférieure à celle du modèle en service.
"""

import hashlib
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

from radio.decouverte.familles import FAMILY
from radio.empreintes.effnet import MODEL_TAG
from radio.empreintes.table import TableEmpreintes, charger_empreintes
from radio.gout.exemples import Dataset, build_labels, weights
from radio.socle.config import GoutConfig

Floats = npt.NDArray[np.float64]
Ints = npt.NDArray[np.int64]


@dataclass(frozen=True)
class TauxOui:
    n: int
    yes: int
    low: float
    high: float

    @property
    def rate(self) -> float:
        return self.yes / self.n


def taux_oui(labels: Ints) -> TauxOui | None:
    """Taux de oui, intervalle de Wilson à 95 %."""
    n, yes = len(labels), int(labels.sum())
    if n == 0:
        return None
    ci = binomtest(yes, n).proportion_ci(confidence_level=0.95, method="wilson")
    return TauxOui(n, yes, float(ci.low), float(ci.high))


def auc(labels: Ints, scores: Floats) -> float | None:
    if len(np.unique(labels)) < 2:
        return None
    return float(roc_auc_score(labels, scores))


def fit(table: TableEmpreintes, ds: Dataset, cfg: GoutConfig) -> Pipeline:
    model = make_pipeline(StandardScaler(), LogisticRegression(C=cfg.c, max_iter=3000))
    return model.fit(
        table.audio[ds.rows],
        ds.labels,
        logisticregression__sample_weight=weights(ds, cfg.poids_negatifs_faibles),
    )


def predict(model: Pipeline, table: TableEmpreintes, rows: Ints) -> Floats:
    if len(rows) == 0:
        return np.zeros(0)
    return np.asarray(model.predict_proba(table.audio[rows])[:, 1], dtype=np.float64)


def _serving_row(conn: sqlite3.Connection) -> sqlite3.Row | None:
    row: sqlite3.Row | None = conn.execute(
        "SELECT modele_id, file FROM modeles WHERE promoted = 1 ORDER BY modele_id DESC LIMIT 1"
    ).fetchone()
    return row


def id_en_service(conn: sqlite3.Connection) -> int | None:
    row = _serving_row(conn)
    return None if row is None else int(row["modele_id"])


def en_service(conn: sqlite3.Connection, models_dir: Path) -> tuple[int, Pipeline] | None:
    row = _serving_row(conn)
    if row is None:
        return None
    return int(row["modele_id"]), joblib.load(models_dir / row["file"])


@dataclass(frozen=True)
class Fournee:
    run_id: int
    n: int
    retained: int
    floored: int


def ecrire_notes(
    conn: sqlite3.Connection,
    model_id: int,
    model: Pipeline,
    table: TableEmpreintes,
    keep: Mapping[str, int],
    floor: Mapping[str, float],
) -> None:
    """Note les candidats de chaque passe de découverte et retient, passe par passe et famille
    par famille, les `keep[famille]` mieux notés : découvertes et nouveautés ne se disputent pas
    la même coupure. Un titre noté sous `floor[famille]` n'est jamais retenu, même quota restant :
    il ne réserve pas son artiste, et le premier de chaque artiste ainsi écarté alors que le quota
    restait est marqué `sous_plancher`, pour le rapport. Un artiste n'entre qu'un titre par fournée,
    toutes familles confondues : son mieux noté (Release Radar,
    docs/recherches/2026-10-02-programmation.md §1). Un candidat entré depuis dans la
    bibliothèque n'est plus une découverte."""
    group_of = {
        int(t): (int(run), FAMILY[str(source)])
        for t, run, source in conn.execute("SELECT titre_id, fournee_id, source FROM candidats")
    }
    artist_of = {
        int(t): int(a)
        for t, a in conn.execute(
            "SELECT titre_id, artiste_id FROM titres JOIN candidats USING (titre_id)"
        )
    }
    rows = np.array(
        [
            i
            for i, (t, origin) in enumerate(
                zip(table.track_ids.tolist(), table.origins, strict=True)
            )
            if t in group_of and origin == "candidat"
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
        conn.execute("DELETE FROM notes")
        conn.executemany(
            "INSERT INTO notes VALUES (?, ?, ?, ?, ?)",
            [
                (int(table.track_ids[i]), model_id, float(s), int(a), int(f))
                for i, s, a, f in zip(rows, scores, accepted, floored, strict=True)
            ],
        )


def derniere_fournee(conn: sqlite3.Connection) -> Fournee | None:
    row = conn.execute(
        """
        SELECT c.fournee_id, COUNT(*), SUM(s.retenu), SUM(s.sous_plancher)
        FROM notes s JOIN candidats c USING (titre_id)
        GROUP BY c.fournee_id ORDER BY c.fournee_id DESC LIMIT 1
        """
    ).fetchone()
    return None if row is None else Fournee(int(row[0]), int(row[1]), int(row[2]), int(row[3]))


def votes_count(conn: sqlite3.Connection) -> int:
    return int(conn.execute("SELECT COUNT(*) FROM votes WHERE vote != 'passer'").fetchone()[0])


def votes_digest(conn: sqlite3.Connection) -> str:
    """Empreinte des votes qui comptent : un vote corrigé la change comme un vote de plus, alors
    que leur nombre, lui, ne bouge pas."""
    rows = conn.execute(
        "SELECT titre_id, type, vote FROM votes WHERE vote != 'passer' ORDER BY titre_id"
    ).fetchall()
    return hashlib.sha256(json.dumps([tuple(r) for r in rows]).encode()).hexdigest()


def entraine_sur(conn: sqlite3.Connection) -> str | None:
    """Empreinte des votes vus par le dernier entraînement (None avant qu'elle soit gardée)."""
    row = conn.execute("SELECT params FROM modeles ORDER BY modele_id DESC LIMIT 1").fetchone()
    return None if row is None else json.loads(row[0]).get("votes_digest")


@dataclass(frozen=True)
class RapportGout:
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


def entrainer(conn: sqlite3.Connection, models_dir: Path, cfg: GoutConfig, now: str) -> RapportGout:
    # Lue avant les exemples : un vote arrivé pendant l'entraînement relance le suivant.
    digest = votes_digest(conn)
    table = charger_empreintes(conn)
    labels = build_labels(conn, table, cfg.fenetre_examen)
    model = fit(table, labels.train, cfg)
    exam = labels.exam
    new_auc = auc(exam.labels, predict(model, table, exam.rows))
    current = en_service(conn, models_dir)
    cur_auc = None if current is None else auc(exam.labels, predict(current[1], table, exam.rows))
    refusal = _decide(current, new_auc, cur_auc)
    verdict = refusal or ("premier modèle" if current is None else "AUC d'examen au moins égale")
    params = {
        "c": cfg.c,
        "poids_negatifs_faibles": cfg.poids_negatifs_faibles,
        "embedding": MODEL_TAG,
        "sklearn": sklearn.__version__,
        "votes": labels.n_votes,
        "votes_digest": digest,
    }
    metrics = {
        "counts": labels.train.counts(),
        "exam": {"n": len(exam.rows), "auc": new_auc, "current_auc": cur_auc},
    }
    models_dir.mkdir(parents=True, exist_ok=True)
    with conn:
        model_id = conn.execute(
            "INSERT INTO modeles (trained_at, file, promoted, verdict, params, metrics) "
            "VALUES (?, '', ?, ?, ?, ?)",
            (now, int(refusal is None), verdict, json.dumps(params), json.dumps(metrics)),
        ).lastrowid
        assert model_id is not None
        file = f"modele-{model_id:04d}.joblib"
        # Dans la transaction : si l'écriture du fichier échoue, la ligne n'existe pas.
        joblib.dump(model, models_dir / file)
        conn.execute("UPDATE modeles SET file = ? WHERE modele_id = ?", (file, model_id))
    return RapportGout(
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


def renoter(conn: sqlite3.Connection, models_dir: Path, cfg: GoutConfig) -> int | None:
    """Note les candidats avec le modèle en service ; renvoie son numéro, None s'il n'y en a pas."""
    current = en_service(conn, models_dir)
    if current is None:
        return None
    model_id, model = current
    ecrire_notes(conn, model_id, model, charger_empreintes(conn), cfg.retenus, cfg.planchers)
    return model_id


@dataclass(frozen=True)
class FavorisRetenus:
    share: float
    n: int
    chance: float


def favoris_retenus(conn: sqlite3.Connection, models_dir: Path) -> FavorisRetenus | None:
    """Part des favoris Hype Machine mesurés que le modèle en service retiendrait, à la coupure
    des découvertes de la dernière fournée ; le hasard en retiendrait `chance`, la part de ces
    découvertes notées à la coupure ou au-dessus (et non la part retenue : la règle d'un titre
    par artiste en écarte qui sont au-dessus). Une mesure de goût sur des centaines de titres que
    Victor aime ; elle ne décide jamais d'une promotion."""
    current = en_service(conn, models_dir)
    row = conn.execute(
        """
        WITH latest AS (
            SELECT s.score, s.retenu FROM notes s JOIN candidats c USING (titre_id)
            WHERE c.source = 'voisin' AND c.fournee_id = (SELECT MAX(fournee_id) FROM candidats)
        ), cut AS (SELECT MIN(score) AS score FROM latest WHERE retenu = 1)
        SELECT cut.score, AVG(latest.score >= cut.score) FROM latest, cut
        """
    ).fetchone()
    table = charger_empreintes(conn)
    rows = np.array([i for i, o in enumerate(table.origins) if o == "favori"], dtype=np.int64)
    if current is None or row[0] is None or len(rows) == 0:
        return None
    scores = predict(current[1], table, rows)
    return FavorisRetenus(float((scores >= float(row[0])).mean()), len(rows), float(row[1]))
