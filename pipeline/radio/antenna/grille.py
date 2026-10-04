"""Grille d'antenne et enchaînement (docs/recherches/2026-10-02-cycle-de-vie.md §6,
docs/recherches/2026-10-02-programmation.md §3).

La grille se remplit créneau par créneau, avec la mécanique des logiciels de programmation radio
(pile de MusicMaster, règles et objectifs de GSelector) :

1. Chaque heure a ses créneaux, répartis entre les catégories selon leurs parts.
2. Pour un créneau, on parcourt la catégorie dans l'ordre de rotation (joué il y a le plus
   longtemps d'abord, d'après l'historique d'AzuraCast), sur une fenêtre de recherche. Deux
   règles incassables : un titre se repose au moins `repos` tour de sa catégorie, un artiste ne
   repasse pas avant `separation_h` heures. Parmi les titres permis, la ressemblance à la cible de
   l'heure est un objectif, jamais une condition : un titre en retard de `avantage` tours y gagne,
   et à `force` tours il passe d'office (règle anti-famine de GSelector). Un titre placé repart en
   fin de rotation.
3. Chaque heure est ensuite ordonnée en fil qui dérive : elle part du dernier titre de la
   précédente et va chaque fois au plus proche, de la fin d'un titre au début du suivant.

Une heure prévoit un titre de plus que la station n'en joue : l'heure suivante démarre à l'heure,
et le secours ne comble pas une fin d'heure. Le titre de trop n'est pas joué ; il reste parmi les
plus anciens et revient le lendemain.
"""

import math
import sqlite3
from collections import Counter
from collections.abc import Iterable
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Protocol

import numpy as np
import numpy.typing as npt

from radio.core.config import Bloc, Categorie, GrilleConfig

Vector = npt.NDArray[np.float64]

CATEGORIES: tuple[Categorie, ...] = ("nouveautes", "decouvertes", "fond", "reperes")
JOURS = ("lun", "mar", "mer", "jeu", "ven", "sam", "dim")
NEUTRE = np.full(3, 0.5)


def bloc(day: int, hour: int) -> Bloc:
    """Bloc de la journée ; `day` en ISO (1 lundi, 7 dimanche). La nuit du vendredi et celle du
    samedi sont en fête jusqu'à 3 h ; le week-end, la fin de nuit commence à 5 h (Heggli 2021)."""
    if (day in (5, 6) and hour >= 20) or (day in (6, 7) and hour < 3):
        return "fete"
    if hour >= 23 or hour < (5 if day in (6, 7) else 4):
        return "nuit"
    if hour < 6:
        return "fin_de_nuit"
    if hour < 12:
        return "matin"
    return "apres_midi" if hour < 20 else "soir"


def playlist_name(day: int, hour: int) -> str:
    return f"Grille {JOURS[day - 1]} {hour:02d}h"


@dataclass(frozen=True)
class Titre:
    tid: int
    artist: int
    categorie: Categorie
    path: str
    song_id: str
    q: Vector
    q_start: Vector
    q_end: Vector
    measured: bool
    # Entrée dans sa catégorie (horodatage UNIX) : le retard d'un titre jamais joué en part.
    since: float


@dataclass
class Plan:
    day: date
    hours: dict[int, list[Titre]]
    slots: dict[str, int] = field(default_factory=dict)
    empty_slots: int = 0
    unmeasured: int = 0
    late: int = 0
    turnover_days: dict[str, float] = field(default_factory=dict)
    max_per_artist: int = 0


def load_titres(conn: sqlite3.Connection) -> list[Titre]:
    """Titres à l'antenne, chaque mesure (énergie = arousal, dansabilité, tempo) ramenée à son
    quantile parmi les titres mesurés : les cibles suivent la couleur de l'antenne. Un titre pas
    encore mesuré est neutre (0,5)."""
    rows = conn.execute(
        """
        SELECT n.deezer_track_id, COALESCE(t.deezer_artist_id, -n.deezer_track_id), n.categorie,
               n.path, n.song_id, f.status = 'ok',
               f.arousal, f.danceability, f.bpm,
               f.arousal_start, f.danceability_start, f.bpm_start,
               f.arousal_end, f.danceability_end, f.bpm_end, n.since
        FROM antenne n
        LEFT JOIN tracks t USING (deezer_track_id)
        LEFT JOIN track_features f USING (deezer_track_id)
        WHERE n.categorie != 'repos'
        ORDER BY n.deezer_track_id
        """
    ).fetchall()
    ok = [r for r in rows if r[5]]
    ref = [np.sort(np.array([float(r[6 + k]) for r in ok])) for k in range(3)]

    def quantiles(values: Iterable[float]) -> Vector:
        return np.array(
            [np.searchsorted(ref[k], v, side="right") / len(ref[k]) for k, v in enumerate(values)]
        )

    out = []
    for r in rows:
        measured = bool(r[5])
        out.append(
            Titre(
                int(r[0]),
                int(r[1]),
                r[2],
                str(r[3]),
                str(r[4]),
                quantiles(map(float, r[6:9])) if measured else NEUTRE,
                quantiles(map(float, r[9:12])) if measured else NEUTRE,
                quantiles(map(float, r[12:15])) if measured else NEUTRE,
                measured,
                datetime.fromisoformat(str(r[15])).timestamp(),
            )
        )
    return out


def shares(titres: list[Titre], grille: GrilleConfig) -> dict[Categorie, float]:
    """Parts d'antenne effectives : tant qu'une catégorie n'a pas son stock, sa part est réduite
    en proportion et rendue aux autres (montée en charge)."""
    n = {c: sum(t.categorie == c for t in titres) for c in CATEGORIES}
    w = {c: grille.categories[c].part * min(1.0, n[c] / grille.stock(c)) for c in CATEGORIES}
    total = sum(w.values())
    return {c: (w[c] / total if total else 0.0) for c in CATEGORIES}


def slot_sequence(weights: dict[Categorie, float], n: int) -> list[Categorie]:
    """`n` créneaux répartis au prorata des poids, régulièrement (smooth weighted round-robin,
    l'algorithme de répartition de nginx)."""
    current = dict.fromkeys(weights, 0.0)
    out: list[Categorie] = []
    total = sum(weights.values())
    for _ in range(n):
        for c, w in weights.items():
            current[c] += w
        best = max(current, key=lambda c: current[c])
        current[best] -= total
        out.append(best)
    return out


def plan_day(
    titres: list[Titre],
    last_played: dict[str, float],
    grille: GrilleConfig,
    day: date,
    hours: list[int],
    midnight: float,
    previous: Titre | None = None,
) -> Plan:
    """`midnight` : minuit du jour, horodatage UNIX dans le fuseau de la station ; `last_played`
    : dernier passage de chaque titre (song_id), même horloge."""
    plan = Plan(day, {h: [] for h in hours}, unmeasured=sum(not t.measured for t in titres))
    weights = {c: w for c, w in shares(titres, grille).items() if w > 0}
    if not weights or not hours:
        return plan
    per_hour = math.ceil(grille.titres_par_heure) + 1
    hour_slots = slot_sequence(weights, per_hour)
    iso = day.isoweekday()
    # Rotation : dernier passage connu, puis chaque titre placé prend l'heure de son créneau.
    clock: dict[int, float | None] = {t.tid: last_played.get(t.song_id) for t in titres}
    by_cat = {c: [t for t in titres if t.categorie == c] for c in weights}
    per_day = {c: weights[c] * per_hour * 24 for c in weights}
    window = {c: max(1, math.ceil(per_day[c] * (grille.marge - 1))) for c in weights}
    # Tour d'une catégorie : le temps qu'il faut pour la jouer en entier. Le retard d'un titre se
    # compte en tours depuis son dernier passage, ou depuis son entrée s'il n'a jamais joué.
    turn = {c: len(by_cat[c]) / per_day[c] * 86400 for c in weights}
    plan.turnover_days = {c: turn[c] / 86400 for c in weights}
    artists = Counter(t.artist for t in titres)
    plan.max_per_artist = max(artists.values(), default=0)
    artist_clock: dict[int, float] = {}
    for t in titres:
        played = clock[t.tid]
        if played is not None:
            artist_clock[t.artist] = max(artist_clock.get(t.artist, played), played)
    separation = grille.separation_h * 3600

    def overdue(t: Titre, now: float) -> float:
        last = clock[t.tid]
        return (now - (t.since if last is None else last)) / turn[t.categorie]

    def allowed(t: Titre, now: float, hour_start: float) -> bool:
        last = clock[t.tid]
        rested = last is None or now - last >= grille.repos * turn[t.categorie]
        return rested and hour_start - artist_clock.get(t.artist, -math.inf) >= separation

    def score(t: Titre, now: float, target: Vector) -> float:
        lead = (overdue(t, now) - grille.avantage) / (grille.force - grille.avantage)
        return float(np.linalg.norm(t.q - target)) - grille.retard * min(1.0, max(0.0, lead))

    # Un titre pas joué depuis plus de `force` tours : la rotation ne tient pas, à surveiller.
    plan.late = sum(overdue(t, midnight) > grille.force for c in weights for t in by_cat[c])

    for h in hours:
        target = _target(grille, iso, h)
        hour_start = midnight + h * 3600
        for k, c in enumerate(hour_slots):
            now = hour_start + k * 3600 / per_hour
            rotation = sorted(by_cat[c], key=lambda t: (clock[t.tid] or -math.inf, t.tid))
            eligible = [t for t in rotation if allowed(t, now, hour_start)][: window[c]]
            if not eligible:
                plan.empty_slots += 1
                continue
            starved = [t for t in eligible if overdue(t, now) >= grille.force]
            t = (
                max(starved, key=lambda t: overdue(t, now))
                if starved
                else min(eligible, key=lambda t: score(t, now, target))
            )
            clock[t.tid] = now
            # Le fil qui dérive réordonne l'heure : l'artiste peut y passer jusqu'à sa fin, et la
            # séparation se compte de là jusqu'au début de l'heure suivante qui le reprend.
            artist_clock[t.artist] = hour_start + 3600
            plan.hours[h].append(t)
            plan.slots[c] = plan.slots.get(c, 0) + 1
    last = previous
    for h in hours:
        plan.hours[h] = _drift(plan.hours[h], last, _target(grille, iso, h))
        if plan.hours[h]:
            last = plan.hours[h][-1]
    return plan


def _target(grille: GrilleConfig, day: int, hour: int) -> Vector:
    c = grille.cibles[bloc(day, hour)]
    return np.array([c.energie, c.dansabilite, c.tempo])


def _drift(titres: list[Titre], previous: Titre | None, target: Vector) -> list[Titre]:
    """Fil qui dérive : chaque titre est le plus proche, à son début, de la fin du précédent."""
    left = list(titres)
    out: list[Titre] = []
    end = previous.q_end if previous is not None else target
    while left:
        nxt = min(left, key=lambda t: (float(np.linalg.norm(t.q_start - end)), t.tid))
        left.remove(nxt)
        out.append(nxt)
        end = nxt.q_end
    return out


def record(conn: sqlite3.Connection, plan: Plan, midnight: float) -> None:
    """Garde la grille publiée heure par heure ; oublie ce qui a plus d'un jour."""
    starts = [(midnight + h * 3600,) for h in plan.hours]
    with conn:
        conn.executemany("DELETE FROM grille WHERE hour_start = ?", starts)
        conn.executemany(
            "INSERT INTO grille VALUES (?, ?)",
            [(midnight + h * 3600, t.song_id) for h, ts in plan.hours.items() for t in ts],
        )
        conn.execute("DELETE FROM grille WHERE hour_start < ?", (midnight - 86400,))


def with_published(
    conn: sqlite3.Connection,
    played: dict[str, float],
    now: float,
    midnight: float,
    hours: Iterable[int],
) -> dict[str, float]:
    """Le dernier passage de chaque titre, en comptant ce que la grille publiée jouera encore :
    un titre publié, pas encore joué, compte comme joué à la fin de son heure. Sans cela, la grille
    écrite à 23:00 replace à minuit les titres et les artistes de 23 h. Les heures que le plan
    réécrit (`hours` du jour de `midnight`) ne joueront pas ce qu'elles avaient : les compter
    bloquerait jusqu'au soir chaque titre et chaque artiste qu'elles remplacent, quand la passe du
    dimanche réécrit le reste de la journée. Le titre de trop d'une heure, jamais joué, n'y perd
    qu'un jour de rotation."""
    rewritten = {midnight + h * 3600 for h in hours}
    out = dict(played)
    for start, song in conn.execute(
        "SELECT hour_start, song_id FROM grille WHERE hour_start + 3600 > ?", (now,)
    ):
        if start in rewritten:
            continue
        out[str(song)] = max(out.get(str(song), -math.inf), float(start) + 3600)
    return out


def m3u(titres: list[Titre]) -> str:
    return "#EXTM3U\n" + "".join(f"{t.path}\n" for t in titres)


class Programmer(Protocol):
    def playlists(self) -> dict[str, int]: ...

    def create_hour_playlist(self, name: str, day: int, hour: int) -> int: ...

    def fill_playlist(self, playlist_id: int, m3u: str) -> int: ...


def publish(plan: Plan, station: Programmer) -> list[str]:
    """Écrit chaque heure du plan dans sa playlist, créée au premier usage ; renvoie les erreurs
    (titres que la station n'a pas retrouvés)."""
    iso = plan.day.isoweekday()
    existing = station.playlists()
    errors = []
    for h, titres in plan.hours.items():
        name = playlist_name(iso, h)
        pid = existing.get(name)
        if pid is None:
            pid = station.create_hour_playlist(name, iso, h)
        found = station.fill_playlist(pid, m3u(titres))
        if found != len(titres):
            errors.append(f"{name} : {found} titres retrouvés sur {len(titres)}")
    return errors
