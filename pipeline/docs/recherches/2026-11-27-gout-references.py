"""Étude du 2026-11-27 : le modèle de goût face à des références simples.

Lit une copie de la base (jamais celle en service) et n'écrit rien. Lancement sur le serveur, avec
le code de cette branche et le `.venv` de production :

    PYTHONPATH=<branche>/pipeline .venv/bin/python <ce fichier> <copie de radio.db> <editorial.toml>

Protocole : le juge est l'examen, comme pour la promotion. Les votes d'examen sont tirés
uniformément dans les fournées et ne servent jamais à l'entraînement ; ils jugent ici toutes les
méthodes sur les mêmes titres. Les écarts à la méthode en service portent un intervalle à 95 %
par bootstrap apparié sur les votes d'examen.
"""

import sqlite3
import sys
from collections import Counter
from collections.abc import Callable
from pathlib import Path

import numpy as np
import numpy.typing as npt
from sklearn.metrics import roc_auc_score

from radio.decouverte.familles import FAMILY
from radio.empreintes.table import TableEmpreintes, charger_empreintes
from radio.gout.exemples import (
    LIBRARY,
    VOTE_NO,
    VOTE_YES,
    WEAK,
    Dataset,
    ExemplesManquantsError,
    build_labels,
)
from radio.gout.modele import fit, predict
from radio.socle.config import GoutConfig, load_editorial

Floats = npt.NDArray[np.float64]
Ints = npt.NDArray[np.int64]
Scorer = Callable[[Ints], Floats]

BOOTSTRAP = 2000
SEEDS = 20
rng = np.random.default_rng(20261127)


def auc(y: Ints, s: Floats) -> float:
    return float(roc_auc_score(y, s))


def paired_ci(y: Ints, ref: Floats, other: Floats) -> tuple[float, float, float]:
    """Écart d'AUC `other - ref` et son intervalle à 95 % (bootstrap apparié sur les votes)."""
    diffs = []
    n = len(y)
    for _ in range(BOOTSTRAP):
        i = rng.integers(0, n, n)
        if len(np.unique(y[i])) < 2:
            continue
        diffs.append(auc(y[i], other[i]) - auc(y[i], ref[i]))
    d = np.array(diffs)
    return auc(y, other) - auc(y, ref), float(np.quantile(d, 0.025)), float(np.quantile(d, 0.975))


def auc_ci(y: Ints, s: Floats) -> tuple[float, float]:
    vals = []
    for _ in range(BOOTSTRAP):
        i = rng.integers(0, len(y), len(y))
        if len(np.unique(y[i])) == 2:
            vals.append(auc(y[i], s[i]))
    return float(np.quantile(vals, 0.025)), float(np.quantile(vals, 0.975))


def unit(x: npt.NDArray[np.float32]) -> npt.NDArray[np.float64]:
    x = x.astype(np.float64)
    return x / np.linalg.norm(x, axis=1, keepdims=True)


def subset(ds: Dataset, keep: npt.NDArray[np.bool_]) -> Dataset:
    return Dataset(ds.rows[keep], ds.labels[keep], ds.base_weights[keep], ds.categories[keep])


def lr_scorer(table: TableEmpreintes, ds: Dataset, cfg: GoutConfig) -> Scorer:
    model = fit(table, ds, cfg)
    return lambda rows: predict(model, table, rows)


def main() -> None:
    db, editorial = Path(sys.argv[1]), Path(sys.argv[2])
    cfg = load_editorial(editorial).gout
    # Lecture seule : l'étude ne migre ni n'écrit la copie.
    conn = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    print(f"Base : user_version {conn.execute('PRAGMA user_version').fetchone()[0]}")
    print(f"Réglages : C={cfg.c}, poids des négatifs faibles={cfg.poids_negatifs_faibles}")

    table = charger_empreintes(conn)
    labels = build_labels(conn, table, fenetre_examen=10**6)
    train, exam = labels.train, labels.exam
    y = exam.labels
    family = {
        int(t): FAMILY[str(s)] for t, s in conn.execute("SELECT titre_id, source FROM candidats")
    }
    exam_fam = np.array([family.get(int(table.track_ids[r]), "?") for r in exam.rows])

    print("\n## Données")
    print(f"Titres mesurés : {len(table.track_ids)} ; {dict(Counter(table.provenances))}")
    print(f"Exemples d'entraînement : {train.counts()}")
    print(f"Examen : {len(y)} votes, {int(y.sum())} oui ; par famille {dict(Counter(exam_fam))}")
    by_week = conn.execute(
        """
        SELECT strftime('%Y-%W', voted_at) AS w, type, COUNT(*) FROM votes
        WHERE vote != 'passer' GROUP BY w, type ORDER BY w
        """
    ).fetchall()
    print("Votes par semaine (examen / leçon) :")
    weeks: dict[str, dict[str, int]] = {}
    for w, kind, n in by_week:
        weeks.setdefault(w, {})[kind] = n
    for w, k in weeks.items():
        print(f"  {w} : {k.get('examen', 0)} / {k.get('lecon', 0)}")
    last = conn.execute("SELECT MAX(voted_at) FROM votes").fetchone()[0]
    print(f"Dernier vote : {last}")

    # Les méthodes, chacune donne un score par ligne de la table.
    lib = train.categories == LIBRARY
    weak = train.categories == WEAK
    votes = np.isin(train.categories, [VOTE_YES, VOTE_NO])
    audio = unit(table.audio)
    lib_rows = train.rows[lib]
    lib_w = train.base_weights[lib]
    centre = (audio[lib_rows] * lib_w[:, None]).sum(axis=0)
    centre /= np.linalg.norm(centre)
    weak_centre = audio[train.rows[weak]].mean(axis=0)
    weak_centre /= np.linalg.norm(weak_centre)

    def knn(k: int) -> Scorer:
        def score(rows: Ints) -> Floats:
            sims = audio[rows] @ audio[lib_rows].T
            top = -np.sort(-sims, axis=1)[:, :k]
            return np.asarray(top.mean(axis=1), dtype=np.float64)

        return score

    lr_variants = {
        "en service (LR, bibliothèque + négatifs faibles + leçon)": train,
        "LR sans aucun vote": subset(train, ~votes),
        "LR sans négatifs faibles": subset(train, ~weak),
        "LR sur les votes de leçon seuls": subset(train, votes),
    }
    methods: dict[str, Scorer] = {}
    for name, ds in lr_variants.items():
        try:
            methods[name] = lr_scorer(table, ds, cfg)
        except ExemplesManquantsError:
            print(f"(« {name} » sauté : il lui manque des positifs ou des négatifs)")
    methods |= {
        "centre de la bibliothèque (cosinus, poids d'écoute)": lambda r: audio[r] @ centre,
        "centre bibliothèque moins centre négatifs": lambda r: audio[r] @ (centre - weak_centre),
        "plus proche voisin de la bibliothèque (k=1)": knn(1),
        "10 plus proches voisins (moyenne)": knn(10),
        "50 plus proches voisins (moyenne)": knn(50),
    }
    ref_name = next(iter(methods))
    scores = {name: f(exam.rows) for name, f in methods.items()}
    if len(np.unique(y)) < 2:
        sys.exit("L'examen n'a pas à la fois des « oui » et des « non » : pas d'AUC.")
    ref = scores[ref_name]

    print("\n## AUC d'examen, toutes familles")
    lo, hi = auc_ci(y, ref)
    print("| méthode | AUC | écart à « en service » [IC 95 %] |")
    print(f"| {ref_name} | {auc(y, ref):.3f} [{lo:.3f} ; {hi:.3f}] | — |")
    for name, s in scores.items():
        if name == ref_name:
            continue
        d, dlo, dhi = paired_ci(y, ref, s)
        print(f"| {name} | {auc(y, s):.3f} | {d:+.3f} [{dlo:+.3f} ; {dhi:+.3f}] |")

    print("\n## AUC d'examen par famille")
    for fam in sorted(set(exam_fam)):
        m = exam_fam == fam
        if len(np.unique(y[m])) < 2:
            print(f"{fam} : {int(m.sum())} votes, une seule classe")
            continue
        print(f"### {fam} ({int(m.sum())} votes, {int(y[m].sum())} oui)")
        for name, s in scores.items():
            print(f"  {auc(y[m], s[m]):.3f}  {name}")

    print("\n## Apport des votes de leçon (courbe d'apprentissage)")
    vote_idx = np.flatnonzero(votes)
    print(f"{len(vote_idx)} votes de leçon ; {SEEDS} tirages par part")
    for frac in (0.0, 0.25, 0.5, 0.75, 1.0):
        vals = []
        n_take = round(frac * len(vote_idx))
        for _ in range(SEEDS if 0 < frac < 1 else 1):
            take = rng.choice(vote_idx, n_take, replace=False)
            keep = ~votes
            keep[take] = True
            vals.append(auc(y, lr_scorer(table, subset(train, keep), cfg)(exam.rows)))
        print(
            f"  {frac:>4.0%} ({n_take} votes) : AUC "
            f"{np.mean(vals):.3f} (de {min(vals):.3f} à {max(vals):.3f})"
        )

    print("\n## Régularisation C (lue sur l'examen : optimiste, à confirmer avant de changer)")
    for c in (0.01, 0.03, 0.1, 0.3, 1.0):
        s = lr_scorer(table, train, cfg.model_copy(update={"c": c}))
        print(f"  C={c} : AUC {auc(y, s(exam.rows)):.3f}")

    print("\n## Examen par période (méthode en service)")
    voted_at = {
        int(t): str(at)
        for t, at in conn.execute(
            "SELECT titre_id, voted_at FROM votes WHERE type = 'examen' AND vote != 'passer'"
        )
    }
    dates = np.array([voted_at[int(table.track_ids[r])][:7] for r in exam.rows])
    for month in sorted(set(dates)):
        m = dates == month
        if len(np.unique(y[m])) == 2:
            print(f"  {month} : {int(m.sum())} votes, AUC {auc(y[m], ref[m]):.3f}")
        else:
            print(f"  {month} : {int(m.sum())} votes, une seule classe")

    print("\n## Favoris Hype Machine contre découvertes de la dernière fournée (non votés)")
    fav = np.array([i for i, o in enumerate(table.provenances) if o == "favori"], dtype=np.int64)
    latest = conn.execute(
        "SELECT titre_id FROM candidats WHERE source = 'voisin' "
        "AND fournee_id = (SELECT MAX(fournee_id) FROM candidats)"
    ).fetchall()
    index = {int(t): i for i, t in enumerate(table.track_ids)}
    voted = {int(r[0]) for r in conn.execute("SELECT titre_id FROM votes")}
    cand = np.array(
        [index[int(r[0])] for r in latest if int(r[0]) in index and int(r[0]) not in voted],
        dtype=np.int64,
    )
    if len(fav) and len(cand):
        yy = np.r_[np.ones(len(fav), dtype=np.int64), np.zeros(len(cand), dtype=np.int64)]
        rows = np.r_[fav, cand]
        print(f"{len(fav)} favoris, {len(cand)} découvertes ; AUC (aimés contre tout-venant) :")
        for name, f in methods.items():
            print(f"  {auc(yy, f(rows)):.3f}  {name}")


main()
