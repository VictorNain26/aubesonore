"""Sélection hebdomadaire des votes et bulletins en attente.

- Examen : tirage uniforme dans chaque famille de la dernière fournée notée (découvertes,
  nouveautés), retenus ou non, à parts égales : sans cela, les ~300 nouveautés d'une fournée de
  ~1 100 titres ne recevraient que 3 votes par semaine, et aucune source ne serait jugée avant
  des mois. Les deux modèles comparés sont notés sur les mêmes votes, et le taux de oui des
  retenus se lit sur les bulletins marqués `retained`. Un vote d'examen n'est jamais un exemple
  d'entraînement (radio/model/dataset.py).
- Leçon : les titres les plus incertains (note la plus proche de la coupure de leur famille,
  découvertes ou nouveautés, dans la dernière fournée), au plus un par artiste : échantillonnage
  par incertitude (Settles, Active Learning Literature Survey, 2009).
- À l'aveugle : l'ordre de présentation est tiré au hasard, la page ne montre que l'artiste et
  le titre.
- Un titre voté ou déjà présenté ne revient jamais. Tant qu'un bulletin attend, aucune nouvelle
  sélection : les semaines sans vote ne s'empilent pas.
- Un vote se corrige tant que sa sélection est la dernière : la passe suivante l'apprend
  (`train`), puis tire une nouvelle sélection qui le fige. Tous les bulletins en attente sont
  dans la dernière sélection, puisqu'aucune n'est tirée tant qu'un bulletin attend.
"""

import sqlite3
from dataclasses import dataclass
from typing import Any

import numpy as np

from radio.core.family import FAMILY
from radio.model.model import serving_id


class NoServingModelError(Exception):
    """Aucun modèle promu : rien ne dit quels titres sont retenus."""


class NoScoresError(Exception):
    """Le modèle en service n'a noté aucun candidat."""


class PendingBallotsError(Exception):
    def __init__(self, n: int) -> None:
        super().__init__(f"{n} bulletins en attente")
        self.n = n


@dataclass(frozen=True)
class Ballot:
    deezer_track_id: int
    kind: str
    position: int
    artist: str
    title: str


@dataclass(frozen=True)
class CastVote:
    ballot: Ballot
    vote: str


@dataclass(frozen=True)
class Selection:
    selection_id: int | None  # None : rien à présenter
    model_id: int
    run_id: int
    n_batch: int  # titres de la dernière fournée encore jamais présentés
    exam: list[int]
    lesson: list[int]


def pending_ballots(conn: sqlite3.Connection) -> list[Ballot]:
    rows = conn.execute(
        """
        SELECT b.deezer_track_id, b.kind, b.position, a.name, t.title
        FROM ballots b
        JOIN tracks t ON t.deezer_track_id = b.deezer_track_id
        JOIN artists a ON a.deezer_artist_id = t.deezer_artist_id
        LEFT JOIN votes v ON v.deezer_track_id = b.deezer_track_id
        WHERE v.deezer_track_id IS NULL
        ORDER BY b.selection_id, b.position
        """
    ).fetchall()
    return [Ballot(int(r[0]), str(r[1]), int(r[2]), str(r[3]), str(r[4])) for r in rows]


def week_votes(conn: sqlite3.Connection) -> list[CastVote]:
    """Votes de la dernière sélection, dans l'ordre de présentation : ceux qui se corrigent."""
    rows = conn.execute(
        """
        SELECT b.deezer_track_id, b.kind, b.position, a.name, t.title, v.vote
        FROM ballots b
        JOIN votes v ON v.deezer_track_id = b.deezer_track_id
        JOIN tracks t ON t.deezer_track_id = b.deezer_track_id
        JOIN artists a ON a.deezer_artist_id = t.deezer_artist_id
        WHERE b.selection_id = (SELECT MAX(selection_id) FROM selections)
        ORDER BY b.position
        """
    ).fetchall()
    return [
        CastVote(Ballot(int(r[0]), str(r[1]), int(r[2]), str(r[3]), str(r[4])), str(r[5]))
        for r in rows
    ]


def record_vote(conn: sqlite3.Connection, track_id: int, vote: str, now: str) -> bool:
    """Enregistre ou corrige le vote d'un bulletin de la dernière sélection. False sinon.

    Une correction garde l'heure du premier vote : la fenêtre d'examen, ordonnée par heure de
    vote (radio/model/dataset.py), ne bouge pas.
    """
    with conn:
        row = conn.execute(
            "SELECT kind FROM ballots WHERE deezer_track_id = ? "
            "AND selection_id = (SELECT MAX(selection_id) FROM selections)",
            (track_id,),
        ).fetchone()
        if row is None:
            return False
        conn.execute(
            "INSERT INTO votes VALUES (?, ?, ?, ?, 'page') "
            "ON CONFLICT (deezer_track_id) DO UPDATE SET vote = excluded.vote",
            (track_id, row[0], vote, now),
        )
    return True


def _draw_exam(families: dict[str, list[int]], n_exam: int, rng: np.random.Generator) -> list[int]:
    """Parts égales entre familles ; une famille trop petite laisse sa part aux autres."""
    exam: list[int] = []
    left = n_exam
    pools = sorted(families.items(), key=lambda kv: (len(kv[1]), kv[0]))
    for i, (_, pool) in enumerate(pools):
        k = min(len(pool), left // (len(pools) - i))
        exam += [int(t) for t in rng.choice(pool, size=k, replace=False)] if k else []
        left -= k
    return sorted(exam)


def _pick_lessons(
    rows: list[Any], cuts: dict[str, float], exam: list[int], examined: set[int], n_lesson: int
) -> list[int]:
    """Les titres les plus proches de la coupure de leur famille, un par artiste, hors examen et
    hors artistes examinés."""
    lesson: list[int] = []
    artists = set(examined)
    uncertain = [r for r in rows if FAMILY[str(r[5])] in cuts]
    for r in sorted(
        uncertain, key=lambda r: (abs(float(r[1]) - cuts[FAMILY[str(r[5])]]), int(r[0]))
    ):
        if len(lesson) == n_lesson:
            break
        tid, artist = int(r[0]), int(r[4])
        if tid in exam or artist in artists:
            continue
        lesson.append(tid)
        artists.add(artist)
    return lesson


def select_batch(
    conn: sqlite3.Connection, rng: np.random.Generator, n_exam: int, n_lesson: int, now: str
) -> Selection:
    waiting = pending_ballots(conn)
    if waiting:
        raise PendingBallotsError(len(waiting))
    model_id = serving_id(conn)
    if model_id is None:
        raise NoServingModelError
    last_run = conn.execute(
        "SELECT MAX(c.run_id) FROM scores s JOIN candidates c USING (deezer_track_id) "
        "WHERE s.model_id = ?",
        (model_id,),
    ).fetchone()[0]
    if last_run is None:
        raise NoScoresError
    run_id = int(last_run)
    rows = conn.execute(
        """
        SELECT s.deezer_track_id, s.score, s.accepted, c.run_id, t.deezer_artist_id, c.source
        FROM scores s
        JOIN candidates c ON c.deezer_track_id = s.deezer_track_id
        JOIN tracks t ON t.deezer_track_id = s.deezer_track_id
        WHERE s.model_id = ?
          AND s.deezer_track_id NOT IN (SELECT deezer_track_id FROM votes)
          AND s.deezer_track_id NOT IN (SELECT deezer_track_id FROM ballots)
        ORDER BY s.deezer_track_id
        """,
        (model_id,),
    ).fetchall()
    families: dict[str, list[int]] = {}
    for r in rows:
        if int(r[3]) == run_id:
            families.setdefault(FAMILY[str(r[5])], []).append(int(r[0]))
    retained = {int(r[0]) for r in rows if int(r[2]) == 1}
    cuts: dict[str, float] = {}
    for source, score in conn.execute(
        "SELECT c.source, MIN(s.score) FROM scores s JOIN candidates c USING (deezer_track_id) "
        "WHERE c.run_id = ? AND s.accepted = 1 GROUP BY c.source",
        (run_id,),
    ):
        family = FAMILY[str(source)]
        cuts[family] = min(cuts.get(family, 1.0), float(score))
    exam = _draw_exam(families, n_exam, rng)
    # Un artiste d'examen, de cette sélection ou d'une précédente, ne reçoit jamais de vote de
    # leçon : le modèle candidat l'aurait vu, pas celui en service, et l'examen le favoriserait.
    examined = {int(r[4]) for r in rows if int(r[0]) in exam} | {
        int(r[0])
        for r in conn.execute(
            "SELECT t.deezer_artist_id FROM ballots b JOIN tracks t USING (deezer_track_id) "
            "WHERE b.kind = 'exam'"
        )
    }
    lesson = _pick_lessons(rows, cuts, exam, examined, n_lesson)
    chosen = [(t, "exam") for t in exam] + [(t, "lesson") for t in lesson]
    if not chosen:
        return Selection(None, model_id, run_id, sum(map(len, families.values())), [], [])
    positions = rng.permutation(len(chosen))
    with conn:
        cur = conn.execute(
            "INSERT INTO selections (selected_at, model_id) VALUES (?, ?)", (now, model_id)
        )
        selection_id = cur.lastrowid
        assert selection_id is not None
        conn.executemany(
            "INSERT INTO ballots VALUES (?, ?, ?, ?, ?)",
            [
                (tid, selection_id, kind, int(p), int(tid in retained))
                for (tid, kind), p in zip(chosen, positions, strict=True)
            ],
        )
    return Selection(selection_id, model_id, run_id, sum(map(len, families.values())), exam, lesson)
