"""Sélection hebdomadaire des votes et bulletins en attente.

- Examen : tirage uniforme dans chaque famille de la dernière fournée notée (découvertes,
  nouveautés), retenus ou non, à parts égales : sans cela, les ~300 nouveautés d'une fournée de
  ~1 100 titres ne recevraient que 3 votes par semaine, et aucune source ne serait jugée avant
  des mois. Les deux modèles comparés sont notés sur les mêmes votes, et le taux de oui des
  retenus se lit sur les bulletins marqués `retenu`. Un vote d'examen n'est jamais un exemple
  d'entraînement (radio/gout/exemples.py).
- Leçon : les titres les plus incertains (note la plus proche de la coupure de leur famille,
  découvertes ou nouveautés, dans la dernière fournée), au plus un par artiste : échantillonnage
  par incertitude (Settles, Active Learning Literature Survey, 2009). La coupure est la limite
  qui a tranché : le plancher de la famille s'il a écarté des titres, sinon sa plus basse note
  retenue.
- À l'aveugle : l'ordre de présentation est tiré au hasard, la page ne montre que l'artiste et
  le titre.
- Un titre voté ou déjà présenté ne revient jamais. Tant qu'un bulletin attend, aucune nouvelle
  sélection : les semaines sans vote ne s'empilent pas.
- Un vote se corrige tant que sa sélection est la dernière : la passe suivante l'apprend
  (`gout`), puis tire une nouvelle sélection qui le fige. Tous les bulletins en attente sont
  dans la dernière sélection, puisqu'aucune n'est tirée tant qu'un bulletin attend.
"""

import sqlite3
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any

import numpy as np

from radio.decouverte.familles import FAMILY
from radio.gout.modele import id_en_service


class AucunModeleEnServiceError(Exception):
    """Aucun modèle promu : rien ne dit quels titres sont retenus."""


class AucuneNoteError(Exception):
    """Le modèle en service n'a noté aucun candidat."""


class BulletinsEnAttenteError(Exception):
    def __init__(self, n: int) -> None:
        super().__init__(f"{n} bulletins en attente")
        self.n = n


@dataclass(frozen=True)
class Bulletin:
    titre_id: int
    type: str
    position: int
    artist: str
    title: str


@dataclass(frozen=True)
class VoteExprime:
    bulletin: Bulletin
    vote: str


@dataclass(frozen=True)
class Tirage:
    tirage_id: int | None  # None : rien à présenter
    modele_id: int
    fournee_id: int
    n_batch: int  # titres de la dernière fournée encore jamais présentés
    exam: list[int]
    lesson: list[int]


def bulletins_en_attente(conn: sqlite3.Connection) -> list[Bulletin]:
    rows = conn.execute(
        """
        SELECT b.titre_id, b.type, b.position, a.name, t.title
        FROM bulletins b
        JOIN titres t ON t.titre_id = b.titre_id
        JOIN artistes a ON a.artiste_id = t.artiste_id
        LEFT JOIN votes v ON v.titre_id = b.titre_id
        WHERE v.titre_id IS NULL
        ORDER BY b.tirage_id, b.position
        """
    ).fetchall()
    return [Bulletin(int(r[0]), str(r[1]), int(r[2]), str(r[3]), str(r[4])) for r in rows]


def votes_semaine(conn: sqlite3.Connection) -> list[VoteExprime]:
    """Votes de la dernière sélection, dans l'ordre de présentation : ceux qui se corrigent."""
    rows = conn.execute(
        """
        SELECT b.titre_id, b.type, b.position, a.name, t.title, v.vote
        FROM bulletins b
        JOIN votes v ON v.titre_id = b.titre_id
        JOIN titres t ON t.titre_id = b.titre_id
        JOIN artistes a ON a.artiste_id = t.artiste_id
        WHERE b.tirage_id = (SELECT MAX(tirage_id) FROM tirages)
        ORDER BY b.position
        """
    ).fetchall()
    return [
        VoteExprime(Bulletin(int(r[0]), str(r[1]), int(r[2]), str(r[3]), str(r[4])), str(r[5]))
        for r in rows
    ]


def enregistrer_vote(conn: sqlite3.Connection, track_id: int, vote: str, now: str) -> bool:
    """Enregistre ou corrige le vote d'un bulletin de la dernière sélection. False sinon.

    Une correction garde l'heure du premier vote : la fenêtre d'examen, ordonnée par heure de
    vote (radio/gout/exemples.py), ne bouge pas.
    """
    with conn:
        row = conn.execute(
            "SELECT type FROM bulletins WHERE titre_id = ? "
            "AND tirage_id = (SELECT MAX(tirage_id) FROM tirages)",
            (track_id,),
        ).fetchone()
        if row is None:
            return False
        conn.execute(
            "INSERT INTO votes VALUES (?, ?, ?, ?) "
            "ON CONFLICT (titre_id) DO UPDATE SET vote = excluded.vote",
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
    rows: list[Any], cuts: dict[str, float], examined: set[int], n_lesson: int
) -> list[int]:
    """Les titres les plus proches de la coupure de leur famille, un par artiste, hors artistes
    examinés (ce qui écarte aussi les titres de l'examen)."""
    lesson: list[int] = []
    artists = set(examined)
    uncertain = [r for r in rows if FAMILY[str(r[5])] in cuts]
    for r in sorted(
        uncertain, key=lambda r: (abs(float(r[1]) - cuts[FAMILY[str(r[5])]]), int(r[0]))
    ):
        if len(lesson) == n_lesson:
            break
        tid, artist = int(r[0]), int(r[4])
        if artist in artists:
            continue
        lesson.append(tid)
        artists.add(artist)
    return lesson


def tirer_bulletins(
    conn: sqlite3.Connection,
    rng: np.random.Generator,
    n_exam: int,
    n_lesson: int,
    now: str,
    *,
    floor: Mapping[str, float],
) -> Tirage:
    waiting = bulletins_en_attente(conn)
    if waiting:
        raise BulletinsEnAttenteError(len(waiting))
    modele_id = id_en_service(conn)
    if modele_id is None:
        raise AucunModeleEnServiceError
    last_run = conn.execute(
        "SELECT MAX(c.fournee_id) FROM notes s JOIN candidats c USING (titre_id) "
        "WHERE s.modele_id = ?",
        (modele_id,),
    ).fetchone()[0]
    if last_run is None:
        raise AucuneNoteError
    fournee_id = int(last_run)
    rows = conn.execute(
        """
        SELECT s.titre_id, s.score, s.retenu, c.fournee_id, t.artiste_id, c.source
        FROM notes s
        JOIN candidats c ON c.titre_id = s.titre_id
        JOIN titres t ON t.titre_id = s.titre_id
        WHERE s.modele_id = ?
          AND s.titre_id NOT IN (SELECT titre_id FROM votes)
          AND s.titre_id NOT IN (SELECT titre_id FROM bulletins)
        ORDER BY s.titre_id
        """,
        (modele_id,),
    ).fetchall()
    families: dict[str, list[int]] = {}
    for r in rows:
        if int(r[3]) == fournee_id:
            families.setdefault(FAMILY[str(r[5])], []).append(int(r[0]))
    retenu = {int(r[0]) for r in rows if int(r[2]) == 1}
    # La coupure d'une famille est la limite qui a vraiment tranché : son plancher s'il a écarté
    # des titres alors que le quota restait, sinon la plus basse note retenue. Une famille sans
    # l'un ni l'autre n'a pas de coupure, donc pas de leçon.
    cuts: dict[str, float] = {}
    for source, lowest, any_floored in conn.execute(
        "SELECT c.source, MIN(CASE WHEN s.retenu = 1 THEN s.score END), MAX(s.sous_plancher) "
        "FROM notes s JOIN candidats c USING (titre_id) WHERE c.fournee_id = ? "
        "GROUP BY c.source",
        (fournee_id,),
    ):
        family = FAMILY[str(source)]
        if any_floored:
            cuts[family] = min(cuts.get(family, 1.0), floor[family])
        elif lowest is not None:
            cuts[family] = min(cuts.get(family, 1.0), float(lowest))
    exam = _draw_exam(families, n_exam, rng)
    # Un artiste d'examen, de cette sélection ou d'une précédente, ne reçoit jamais de vote de
    # leçon : le modèle candidat l'aurait vu, pas celui en service, et l'examen le favoriserait.
    examined = {int(r[4]) for r in rows if int(r[0]) in exam} | {
        int(r[0])
        for r in conn.execute(
            "SELECT t.artiste_id FROM bulletins b JOIN titres t USING (titre_id) "
            "WHERE b.type = 'examen'"
        )
    }
    lesson = _pick_lessons(rows, cuts, examined, n_lesson)
    chosen = [(t, "examen") for t in exam] + [(t, "lecon") for t in lesson]
    if not chosen:
        return Tirage(None, modele_id, fournee_id, sum(map(len, families.values())), [], [])
    positions = rng.permutation(len(chosen))
    with conn:
        cur = conn.execute(
            "INSERT INTO tirages (selected_at, modele_id) VALUES (?, ?)", (now, modele_id)
        )
        tirage_id = cur.lastrowid
        assert tirage_id is not None
        conn.executemany(
            "INSERT INTO bulletins VALUES (?, ?, ?, ?, ?)",
            [
                (tid, tirage_id, type_, int(p), int(tid in retenu))
                for (tid, type_), p in zip(chosen, positions, strict=True)
            ],
        )
    return Tirage(tirage_id, modele_id, fournee_id, sum(map(len, families.values())), exam, lesson)
