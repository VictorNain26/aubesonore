"""Exemples d'entraînement et jeu d'examen.

- Positifs : titres de la bibliothèque (poids d'écoute) et « oui » de leçon.
- Négatifs : « non » de leçon, et négatifs faibles (origine `negative`), sous-pondérés.
- « Passer » est ignoré. Un vote l'emporte sur l'origine du titre.
- Un titre voté à l'examen n'est jamais un exemple d'entraînement.
- Un négatif faible est écarté si son artiste est dans la bibliothèque (id ou nom normalisé), ou
  si sa clé de dédoublonnage est celle d'un titre de la bibliothèque ou d'un titre voté.
- Un candidat sans vote n'est pas un exemple.
"""

import sqlite3
from dataclasses import dataclass

import numpy as np
import numpy.typing as npt

from radio.bibliotheque.artistes import artistes_bibliotheque, noms_bibliotheque
from radio.bibliotheque.poids import WEIGHT_CAP, play_weight
from radio.empreintes.table import TableEmpreintes

Floats = npt.NDArray[np.float64]
Ints = npt.NDArray[np.int64]

CATEGORIES = ("library", "vote_yes", "vote_no", "weak")
LIBRARY, VOTE_YES, VOTE_NO, WEAK = range(len(CATEGORIES))
# Un vote est un jugement direct : il pèse autant que le titre le plus écouté de la bibliothèque.
VOTE_WEIGHT = WEIGHT_CAP


class ExemplesManquantsError(Exception):
    """Il faut des exemples positifs et négatifs de poids non nul."""


@dataclass(frozen=True)
class Dataset:
    rows: Ints  # indices dans la TableEmpreintes
    labels: Ints  # 1 positif, 0 négatif
    base_weights: Floats  # avant négatifs faibles et équilibrage
    categories: Ints  # index dans CATEGORIES

    def counts(self) -> dict[str, int]:
        return {name: int((self.categories == i).sum()) for i, name in enumerate(CATEGORIES)}


@dataclass(frozen=True)
class Examen:
    rows: Ints
    labels: Ints


@dataclass(frozen=True)
class Labels:
    train: Dataset
    exam: Examen
    n_votes_unmeasured: int
    n_weak_excluded: int
    n_votes: int


def _plays(conn: sqlite3.Connection) -> dict[int, int]:
    return {
        int(r[0]): int(r[1])
        for r in conn.execute(
            """
            SELECT m.deezer_track_id, SUM(t.plays)
            FROM deezer_matches m JOIN library_tracks t USING (plex_key)
            WHERE m.status = 'matched' GROUP BY m.deezer_track_id
            """
        )
    }


def build_labels(conn: sqlite3.Connection, table: TableEmpreintes, fenetre_examen: int) -> Labels:
    index = {int(t): i for i, t in enumerate(table.track_ids)}
    votes = conn.execute(
        """
        SELECT deezer_track_id AS tid, kind, vote, voted_at FROM votes
        WHERE vote != 'passer' ORDER BY voted_at, deezer_track_id
        """
    ).fetchall()
    unmeasured = sum(1 for v in votes if v["tid"] not in index)
    exam_ids = {v["tid"] for v in votes if v["kind"] == "exam"}
    exam = [v for v in votes if v["kind"] == "exam" and v["tid"] in index][-fenetre_examen:]
    lesson = {v["tid"]: v["vote"] for v in votes if v["kind"] == "lesson" and v["tid"] in index}
    keys = {
        int(r[0]): str(r[1]) for r in conn.execute("SELECT deezer_track_id, dedupe_key FROM tracks")
    }
    exam_keys = {keys[t] for t in exam_ids if t in keys}
    protected = {keys[t] for t in lesson} | exam_keys
    protected |= {
        str(r[0]) for r in conn.execute("SELECT dedupe_key FROM tracks WHERE origin = 'library'")
    }
    lib_ids = {a.deezer_artist_id for a in artistes_bibliotheque(conn)}
    lib_names = noms_bibliotheque(conn)
    plays = _plays(conn)

    rows: list[int] = []
    labels: list[int] = []
    base: list[float] = []
    cats: list[int] = []
    excluded = 0
    for i, (tid, origin) in enumerate(zip(table.track_ids.tolist(), table.origins, strict=True)):
        if tid in exam_ids:
            continue
        if tid in lesson:
            yes = lesson[tid] == "oui"
            label, weight, cat = int(yes), VOTE_WEIGHT, VOTE_YES if yes else VOTE_NO
        elif origin == "library":
            if keys[tid] in exam_keys:
                continue  # autre version d'un titre d'examen : elle le révélerait au modèle
            label, weight, cat = 1, play_weight(plays.get(tid, 0)), LIBRARY
        elif origin == "negative":
            if (
                int(table.artist_ids[i]) in lib_ids
                or table.artist_keys[i] in lib_names
                or keys[tid] in protected
            ):
                excluded += 1
                continue
            label, weight, cat = 0, 1.0, WEAK
        else:
            continue  # candidat sans vote : pas un exemple
        rows.append(i)
        labels.append(label)
        base.append(weight)
        cats.append(cat)
    train = Dataset(
        rows=np.array(rows, dtype=np.int64),
        labels=np.array(labels, dtype=np.int64),
        base_weights=np.array(base, dtype=np.float64),
        categories=np.array(cats, dtype=np.int64),
    )
    exam_set = Examen(
        rows=np.array([index[v["tid"]] for v in exam], dtype=np.int64),
        labels=np.array([int(v["vote"] == "oui") for v in exam], dtype=np.int64),
    )
    return Labels(train, exam_set, unmeasured, excluded, len(votes))


def weights(ds: Dataset, poids_negatifs_faibles: float) -> Floats:
    """Négatifs faibles sous-pondérés, puis chaque classe ramenée à un poids total de 1 : le C
    de la régression ne dépend pas de la taille de la bibliothèque."""
    w = ds.base_weights.copy()
    w[ds.categories == WEAK] *= poids_negatifs_faibles
    pos, neg = w[ds.labels == 1].sum(), w[ds.labels == 0].sum()
    if pos == 0 or neg == 0:
        raise ExemplesManquantsError("il faut des exemples positifs et négatifs")
    w[ds.labels == 1] /= pos
    w[ds.labels == 0] /= neg
    return w
