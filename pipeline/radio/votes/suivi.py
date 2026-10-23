"""Suivi des sources (docs/conception.md §8.1) : ce que chaque source et chaque genre apportent,
de la fournée à l'antenne, et les points à ajuster.

- Parcours de la dernière fournée : candidats, retenus, prêts ou publiés, échecs d'acquisition,
  à l'antenne.
- Points à ajuster, chacun nommé avec sa règle :
  - une source sous les autres à l'examen, dès `MIN_VOTES` votes (conception §3.1) ;
  - un genre lu qui n'a rien apporté de neuf à la dernière fournée ;
  - une source dont la moitié des retenus reste introuvable sur Soulseek.
"""

import sqlite3
from dataclasses import dataclass

import numpy as np

from radio.core.config import FreshConfig
from radio.model.model import YesRate, yes_rate

MIN_VOTES = 20
MIN_TRIED = 10


def pct(x: float) -> str:
    return f"{100 * x:.0f} %"


@dataclass(frozen=True)
class Suivi:
    run_id: int | None
    flows: list["Flow"]
    by_source: list[tuple[str, YesRate]]
    to_adjust: list[str]


@dataclass(frozen=True)
class Flow:
    source: str
    detail: str | None
    candidates: int
    retained: int
    ready: int
    failed: int
    on_air: int

    @property
    def key(self) -> str:
        return self.source if self.detail is None else f"{self.source} · {self.detail}"


def last_flows(conn: sqlite3.Connection) -> tuple[int | None, list[Flow]]:
    """Parcours de chaque source, et de chaque genre ou blog, dans la dernière fournée. Les blogs
    de Hype Machine sont trop nombreux pour un parcours chacun : la source suffit."""
    run = conn.execute("SELECT MAX(run_id) FROM candidates").fetchone()[0]
    if run is None:
        return None, []
    rows = conn.execute(
        """
        SELECT c.source, CASE c.source WHEN 'deezer_editorial' THEN c.detail END,
               COUNT(*), COALESCE(SUM(s.accepted), 0),
               COUNT(*) FILTER (WHERE a.status IN ('ready', 'published')),
               COUNT(*) FILTER (WHERE a.status = 'failed'),
               COUNT(n.deezer_track_id)
        FROM candidates c
        LEFT JOIN scores s USING (deezer_track_id)
        LEFT JOIN acquisitions a USING (deezer_track_id)
        LEFT JOIN antenne n
            ON n.deezer_track_id = c.deezer_track_id AND n.categorie != 'repos'
        WHERE c.run_id = ?
        GROUP BY 1, 2 ORDER BY 1, 2
        """,
        (run,),
    ).fetchall()
    return int(run), [
        Flow(str(r[0]), None if r[1] is None else str(r[1]), *(int(x) for x in r[2:])) for r in rows
    ]


def yes_by_source(conn: sqlite3.Connection) -> list[tuple[str, YesRate]]:
    """Taux de oui à l'examen par source (docs/conception.md §3), puis par blog ou genre : l'examen
    tire uniformément dans chaque famille de la fournée, donc il juge la source elle-même, avant
    le modèle."""
    rows = conn.execute(
        """
        SELECT c.source, c.detail, v.vote FROM votes v JOIN candidates c USING (deezer_track_id)
        WHERE v.kind = 'exam' AND v.vote != 'passer'
        """
    ).fetchall()
    groups: dict[str, list[int]] = {}
    for source, detail, vote in rows:
        keys = [str(source)] + ([f"{source} · {detail}"] if detail is not None else [])
        for key in keys:
            groups.setdefault(key, []).append(int(vote == "oui"))
    rates = {k: yes_rate(np.array(v, dtype=np.int64)) for k, v in groups.items()}
    return [(k, r) for k, r in sorted(rates.items()) if r is not None]


def adjustments(
    conn: sqlite3.Connection, flows: list[Flow], genres: list[str], sources: list[str]
) -> list[str]:
    """Points à ajuster, chacun avec la règle qui le déclenche."""
    out = []
    exam = conn.execute(
        """
        SELECT c.source, c.detail, v.vote = 'oui' FROM votes v
        JOIN candidates c USING (deezer_track_id)
        WHERE v.kind = 'exam' AND v.vote != 'passer'
        """
    ).fetchall()
    for key, r in yes_by_source(conn):
        if r.n < MIN_VOTES:
            continue
        others = [
            int(yes)
            for source, detail, yes in exam
            if key not in (str(source), f"{source} · {detail}")
        ]
        if others and r.high < float(np.mean(others)):
            out.append(
                f"{key} : {r.yes} oui sur {r.n} votes d'examen, nettement sous le reste "
                f"({pct(float(np.mean(others)))}) : à retirer ou remplacer"
            )
    seen = {f.detail for f in flows if f.source == "deezer_editorial"}
    out += [
        f"deezer_editorial · {g} : rien de neuf dans la dernière fournée"
        for g in genres
        if g not in seen
    ]
    present = {f.source for f in flows}
    out += [f"{s} : rien de neuf dans la dernière fournée" for s in sources if s not in present]
    for f in flows:
        tried = f.ready + f.failed
        if tried >= MIN_TRIED and f.failed * 2 >= tried:
            out.append(f"{f.key} : {f.failed} retenus introuvables sur {tried} tentés (Soulseek)")
    return out


def load_suivi(conn: sqlite3.Connection, fresh: FreshConfig) -> Suivi:
    genres = list(fresh.deezer_editorial)
    sources = (
        ["voisin"]
        + (["hypem"] if fresh.hypem_pages else [])
        + (["deezer_editorial"] if genres else [])
    )
    run_id, flows = last_flows(conn)
    return Suivi(run_id, flows, yes_by_source(conn), adjustments(conn, flows, genres, sources))


def suivi_lines(s: Suivi) -> list[str]:
    head = "Parcours de la dernière fournée" + (f" (n°{s.run_id})" if s.run_id else "")
    lines = [head + " : candidats → retenus → prêts (échecs) → à l'antenne"]
    lines += [
        f"  {f.key} : {f.candidates} → {f.retained} → {f.ready} ({f.failed}) → {f.on_air}"
        for f in s.flows
    ] or ["  aucune fournée"]
    lines.append("Taux de oui à l'examen par source :")
    lines += [
        f"  {key} : {pct(r.rate)} [{pct(r.low)} - {pct(r.high)}] sur {r.n}"
        for key, r in s.by_source
    ] or ["  aucun vote d'examen sur un candidat"]
    lines.append("À ajuster :")
    lines += [f"  {a}" for a in s.to_adjust] or ["  rien"]
    return lines
